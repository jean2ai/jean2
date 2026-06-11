import { useState, useEffect, useCallback } from 'react';
import { ChevronRight, CheckSquare, X, Archive, MoreHorizontal, Trash2, Tag } from 'lucide-react';
import type { Session } from '@jean2/sdk';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
} from '@/components/ui/sidebar';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SessionMenuButton, type ChildrenMap, type SessionDerivedValuesMap } from './SessionMenuButton';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import { useTagCollapseState } from '@/hooks/useTagCollapseState';

interface WorkspaceSessionContentProps {
  activeSessions: Session[];
  archivedSessions: Session[];
  childrenMap: ChildrenMap;
  sessionDerivedValues: SessionDerivedValuesMap;
  currentSessionId: string | null;
  onResumeSession: (sessionId: string) => void;
  onCloseSession: (sessionId: string) => void;
  onReopenSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onRenameSession: (sessionId: string, title: string) => void;
  onRegenerateSessionTitle?: (sessionId: string) => void;
  onBulkCloseSessions: (sessionIds: Set<string>) => void;
  onBulkDeleteSessions: (sessionIds: Set<string>) => void;
  tagGroups: Map<string, Session[]>;
  orderedTagNames: string[];
  allWorkspaceTags: string[];
  onAddTag: (sessionId: string, tag: string) => void;
  onRemoveTag: (sessionId: string, tag: string) => void;
}

export function WorkspaceSessionContent({
  activeSessions,
  archivedSessions,
  childrenMap,
  sessionDerivedValues,
  currentSessionId,
  onResumeSession,
  onCloseSession,
  onReopenSession,
  onDeleteSession,
  onRenameSession,
  onRegenerateSessionTitle,
  onBulkCloseSessions,
  onBulkDeleteSessions,
  tagGroups,
  orderedTagNames,
  allWorkspaceTags,
  onAddTag,
  onRemoveTag,
}: WorkspaceSessionContentProps) {
  const { isTagOpen, toggleTag } = useTagCollapseState();
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteAllDialogOpen, setDeleteAllDialogOpen] = useState(false);

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectionMode = useCallback(() => {
    setSelectionMode(prev => !prev);
    setSelectedIds(new Set());
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(activeSessions.map(s => s.id)));
  }, [activeSessions]);

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const handleBulkArchive = useCallback(() => {
    if (selectedIds.size > 0) {
      onBulkCloseSessions(selectedIds);
      setSelectedIds(new Set());
      setSelectionMode(false);
    }
  }, [selectedIds, onBulkCloseSessions]);

  const handleCancel = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  const handleDeleteAllArchived = useCallback(() => {
    const ids = new Set(archivedSessions.map(s => s.id));
    if (ids.size > 0) {
      onBulkDeleteSessions(ids);
    }
    setDeleteAllDialogOpen(false);
  }, [archivedSessions, onBulkDeleteSessions]);

  useEffect(() => {
    if (!selectionMode) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectionMode, handleCancel]);

  const renderSessionButton = (session: Session) => (
    <SessionMenuButton
      key={session.id}
      session={session}
      childrenMap={childrenMap}
      sessionDerivedValues={sessionDerivedValues}
      isActive={currentSessionId === session.id}
      currentSessionId={currentSessionId}
      onResumeSession={onResumeSession}
      onCloseSession={onCloseSession}
      onReopenSession={onReopenSession}
      onDeleteSession={onDeleteSession}
      onRename={onRenameSession}
      onRegenerateTitle={onRegenerateSessionTitle}
      selectionMode={selectionMode}
      selected={selectedIds.has(session.id)}
      onToggleSelect={handleToggleSelect}
      allWorkspaceTags={allWorkspaceTags}
      onAddTag={onAddTag}
      onRemoveTag={onRemoveTag}
    />
  );

  const hasTags = orderedTagNames.length > 0;
  const ungroupedSessions = tagGroups.get('__ungrouped__') ?? [];

  const renderActiveSection = () => (
    <Collapsible defaultOpen className="group/collapsible">
      <SidebarGroup>
        <SidebarGroupLabel asChild>
          <CollapsibleTrigger asChild>
            <div className="flex items-center justify-between w-full">
              <span className="flex items-center gap-2">
                <ChevronRight className="size-3 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                Active
              </span>
              <div className="flex items-center gap-2">
              {selectionMode && (
                <span className="text-xs text-muted-foreground">
                  {selectedIds.size > 0 ? (
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        if (selectedIds.size === activeSessions.length) {
                          deselectAll();
                        } else {
                          selectAll();
                        }
                      }}
                      className="hover:underline cursor-pointer"
                    >
                      {selectedIds.size === activeSessions.length ? 'Deselect all' : 'Select all'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        selectAll();
                      }}
                      className="hover:underline cursor-pointer"
                    >
                      Select all
                    </button>
                  )}
                </span>
              )}
              <Badge variant="secondary">{activeSessions.length}</Badge>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    onClick={e => e.stopPropagation()}
                    className="p-1 rounded-md hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
                    title="Session actions"
                  >
                    <MoreHorizontal className="size-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-48">
                  {selectionMode ? (
                    <DropdownMenuItem onClick={e => { e.stopPropagation(); handleCancel(); }}>
                      <X className="size-4" />
                      Cancel selection
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem onClick={e => { e.stopPropagation(); toggleSelectionMode(); }}>
                      <CheckSquare className="size-4" />
                      Select to archive
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            </div>
          </CollapsibleTrigger>
        </SidebarGroupLabel>
        <CollapsibleContent>
          <SidebarGroupContent>
            {hasTags ? (
              <>
                {orderedTagNames.map(tagName => {
                  const sessions = tagGroups.get(tagName) ?? [];
                  return (
                    <Collapsible key={tagName} open={isTagOpen(tagName)} onOpenChange={(open) => toggleTag(tagName, open)} className="group/tag-collapsible">
                      <div className="flex items-center px-2 py-1 text-xs font-medium text-muted-foreground">
                        <CollapsibleTrigger asChild>
                          <button className="flex items-center gap-1 hover:text-foreground transition-colors">
                            <ChevronRight className="size-3 transition-transform group-data-[state=open]/tag-collapsible:rotate-90" />
                            <Tag className="size-3" />
                            {tagName}
                          </button>
                        </CollapsibleTrigger>
                        <Badge variant="secondary" className="ml-auto text-[10px]">{sessions.length}</Badge>
                      </div>
                      <CollapsibleContent>
                        <SidebarMenu>
                          {sessions.map(renderSessionButton)}
                        </SidebarMenu>
                      </CollapsibleContent>
                    </Collapsible>
                  );
                })}
                {ungroupedSessions.length > 0 && (
                  <SidebarMenu>
                    {ungroupedSessions.map(renderSessionButton)}
                  </SidebarMenu>
                )}
              </>
            ) : (
              <SidebarMenu>
                {activeSessions.map(renderSessionButton)}
              </SidebarMenu>
            )}
          </SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  );

  return (
    <>
      {renderActiveSection()}

      {/* Archived Sessions */}
      {archivedSessions.length > 0 && (
        <Collapsible className="group/collapsible">
          <SidebarGroup>
            <SidebarGroupLabel asChild>
              <CollapsibleTrigger asChild>
                <div className="flex items-center justify-between w-full">
                  <span className="flex items-center gap-2">
                    <ChevronRight className="size-3 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                    Archived
                  </span>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{archivedSessions.length}</Badge>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          onClick={e => e.stopPropagation()}
                          className="p-1 rounded-md hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
                          title="Archived actions"
                        >
                          <MoreHorizontal className="size-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="min-w-48">
                        <DropdownMenuItem
                          onClick={e => { e.stopPropagation(); setDeleteAllDialogOpen(true); }}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="size-4" />
                          Delete all
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </CollapsibleTrigger>
            </SidebarGroupLabel>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu>
                  {archivedSessions.map(session => (
                    <SessionMenuButton
                      key={session.id}
                      session={session}
                      childrenMap={childrenMap}
                      sessionDerivedValues={sessionDerivedValues}
                      isActive={currentSessionId === session.id}
                      currentSessionId={currentSessionId}
                      onResumeSession={onResumeSession}
                      onCloseSession={onCloseSession}
                      onReopenSession={onReopenSession}
                      onDeleteSession={onDeleteSession}
                      onRename={onRenameSession}
                      onRegenerateTitle={onRegenerateSessionTitle}
                      allWorkspaceTags={allWorkspaceTags}
                      onAddTag={onAddTag}
                      onRemoveTag={onRemoveTag}
                    />
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </SidebarGroup>
        </Collapsible>
      )}

      {/* Empty State */}
      {activeSessions.length === 0 && archivedSessions.length === 0 && (
        <div className="p-4 text-center text-sm text-muted-foreground">
          No sessions yet.
          <br />
          Start a new chat to begin.
        </div>
      )}

      {/* Bulk Action Bar */}
      {selectionMode && selectedIds.size > 0 && (
        <div className="sticky bottom-0 bg-sidebar border-t px-2 py-1.5 flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground truncate min-w-0">
            {selectedIds.size} selected
          </span>
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="outline" size="icon" onClick={handleBulkArchive} title="Archive" className="size-7">
              <Archive className="size-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={handleCancel} title="Cancel" className="size-7">
              <X className="size-4" />
            </Button>
          </div>
        </div>
      )}

      <ConfirmationDialog
        open={deleteAllDialogOpen}
        onOpenChange={setDeleteAllDialogOpen}
        title="Delete all archived sessions?"
        description={`This will permanently delete ${archivedSessions.length} archived session${archivedSessions.length === 1 ? '' : 's'}. This action cannot be undone.`}
        confirmLabel="Delete all"
        variant="destructive"
        onConfirm={handleDeleteAllArchived}
      />
    </>
  );
}