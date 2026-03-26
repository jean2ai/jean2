import type { InterruptReason, SessionInterruptResult } from '@jean2/shared';
import { getSession, getChildSessions, updateSession } from '@/store';

interface SessionAbortContext {
  sessionId: string;
  controller: AbortController;
  toolControllers: Map<string, AbortController>;
  childSessionIds: Set<string>;
}

class InterruptManager {
  private sessionContexts = new Map<string, SessionAbortContext>();
  
  registerSession(sessionId: string): AbortController {
    const controller = new AbortController();
    const context: SessionAbortContext = {
      sessionId,
      controller,
      toolControllers: new Map(),
      childSessionIds: new Set(),
    };
    
    this.sessionContexts.set(sessionId, context);
    
    const session = getSession(sessionId);
    if (session?.parentId) {
      const parentContext = this.sessionContexts.get(session.parentId);
      if (parentContext) {
        parentContext.childSessionIds.add(sessionId);
        
        parentContext.controller.signal.addEventListener('abort', () => {
          this.interruptSession(sessionId, 'cascade');
        });
      }
    }
    
    return controller;
  }
  
  registerToolExecution(sessionId: string, toolCallId: string): AbortController {
    const context = this.sessionContexts.get(sessionId);
    
    const toolController = new AbortController();
    
    if (context) {
      context.toolControllers.set(toolCallId, toolController);
      
      context.controller.signal.addEventListener('abort', () => {
        toolController.abort();
      });
    }
    
    return toolController;
  }
  
  async interruptSession(
    sessionId: string, 
    _reason: InterruptReason = 'user_request'
  ): Promise<SessionInterruptResult> {
    const context = this.sessionContexts.get(sessionId);
    const cascadedTo: string[] = [];
    const interruptedTools: string[] = [];
    
    if (context) {
      for (const [toolCallId, toolController] of context.toolControllers) {
        if (!toolController.signal.aborted) {
          toolController.abort();
          interruptedTools.push(toolCallId);
        }
      }
      
      if (!context.controller.signal.aborted) {
        context.controller.abort();
      }
      
      for (const childId of context.childSessionIds) {
        cascadedTo.push(childId);
      }
    }
    
    // Only set subagentStatus for actual subagent sessions (those with a parentId)
    // Main sessions should not have their status changed to error on interrupt
    const session = getSession(sessionId);
    if (session?.parentId) {
      updateSession(sessionId, {
        subagentStatus: 'interrupted',
      });
    }
    
    const childSessions = getChildSessions(sessionId);
    for (const child of childSessions) {
      if (child.subagentStatus === 'running') {
        const childResult = await this.interruptSession(child.id, 'cascade');
        cascadedTo.push(...childResult.cascadedTo.filter(id => !cascadedTo.includes(id)));
        interruptedTools.push(...childResult.interruptedTools);
      }
    }
    
    return {
      sessionId,
      success: true,
      cascadedTo: [...new Set(cascadedTo)],
      interruptedTools: [...new Set(interruptedTools)],
    };
  }
  
  isSessionActive(sessionId: string): boolean {
    const context = this.sessionContexts.get(sessionId);
    return context !== undefined && !context.controller.signal.aborted;
  }
  
  isSessionInterrupted(sessionId: string): boolean {
    const context = this.sessionContexts.get(sessionId);
    return context?.controller.signal.aborted ?? false;
  }
  
  unregisterSession(sessionId: string): void {
    this.sessionContexts.delete(sessionId);
  }
  
  unregisterToolExecution(sessionId: string, toolCallId: string): void {
    const context = this.sessionContexts.get(sessionId);
    if (context) {
      context.toolControllers.delete(toolCallId);
    }
  }
}

export const interruptManager = new InterruptManager();
