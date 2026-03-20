import { spawn, type ChildProcess } from 'child_process';
import { pathToFileURL } from 'url';

import type {
  Position,
  Range,
  Location,
  DefinitionResult,
  ReferencesResult,
  HoverResult,
  DocumentSymbolResult,
  LSPClientInfo,
} from '@/types';
import { LSPClientStatus } from '@/types';

export abstract class BaseLSPClient {
  abstract readonly languageId: string;
  abstract readonly serverCommand: string[];

  protected process: ChildProcess | null = null;
  protected status: LSPClientStatus = LSPClientStatus.Stopped;
  protected error: string | undefined;
  protected requestId = 0;
  protected pendingRequests = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (reason: unknown) => void }
  >();
  protected buffer = '';
  protected capabilities: Record<string, unknown> | undefined;

  abstract getInitializeOptions(): Record<string, unknown>;

  async start(workspaceRoot: string): Promise<void> {
    if (this.process) {
      await this.stop();
    }

    this.status = LSPClientStatus.Starting;
    this.error = undefined;
    this.buffer = '';
    this.requestId = 0;
    this.pendingRequests.clear();

    const command = this.serverCommand[0];
    const args = this.serverCommand.slice(1);

    this.process = spawn(command, args, {
      cwd: workspaceRoot,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.process.stdout?.on('data', (data: Buffer) => {
      this.handleData(data);
    });

    this.process.stderr?.on('data', (data: Buffer) => {
      console.error(`[${this.languageId} LSP] stderr: ${data.toString()}`);
    });

    this.process.on('error', (err) => {
      console.error(`[${this.languageId} LSP] process error:`, err);
      this.error = err.message;
      this.status = LSPClientStatus.Error;
    });

    this.process.on('exit', (code, signal) => {
      this.status = LSPClientStatus.Stopped;
      this.process = null;

      this.pendingRequests.forEach(({ reject }) => {
        reject(new Error(`LSP process exited with code ${code}, signal ${signal}`));
      });
      this.pendingRequests.clear();
    });

    await this.initialize(workspaceRoot);
    this.status = LSPClientStatus.Ready;
  }

  async stop(): Promise<void> {
    if (!this.process) {
      return;
    }

    try {
      this.sendNotification('shutdown', null);
    } catch (_e) {
      // Ignore errors during shutdown
    }

    this.process.kill();
    this.process = null;
    this.status = LSPClientStatus.Stopped;
    this.pendingRequests.clear();
    this.capabilities = undefined;
  }

  getStatus(): LSPClientInfo {
    return {
      languageId: this.languageId,
      status: this.status,
      error: this.error,
      capabilities: this.capabilities,
    };
  }

  async openFile(uri: string, content: string): Promise<void> {
    const params = {
      textDocument: {
        uri,
        languageId: this.languageId,
        version: 1,
        text: content,
      },
    };

    this.sendNotification('textDocument/didOpen', params);
  }

  async closeFile(uri: string): Promise<void> {
    const params = {
      textDocument: {
        uri,
      },
    };

    this.sendNotification('textDocument/didClose', params);
  }

  async changeFile(uri: string, content: string, version: number): Promise<void> {
    const params = {
      textDocument: {
        uri,
        version,
      },
      contentChanges: [
        {
          text: content,
        },
      ],
    };

    this.sendNotification('textDocument/didChange', params);
  }

  async getDefinition(uri: string, position: Position): Promise<DefinitionResult> {
    const params = {
      textDocument: {
        uri,
      },
      position,
    };

    const result = await this.sendRequest('textDocument/definition', params);

    if (!result) {
      return null;
    }

    if (Array.isArray(result)) {
      return result.map((loc) => this.normalizeLocation(loc));
    }

    return [this.normalizeLocation(result)];
  }

  async getReferences(uri: string, position: Position): Promise<ReferencesResult> {
    const params = {
      textDocument: {
        uri,
      },
      position,
      context: {
        includeDeclaration: true,
      },
    };

    const result = await this.sendRequest('textDocument/references', params);

    if (!result || !Array.isArray(result)) {
      return [];
    }

    return result.map((loc) => this.normalizeLocation(loc));
  }

  async getHover(uri: string, position: Position): Promise<HoverResult> {
    const params = {
      textDocument: {
        uri,
      },
      position,
    };

    const result = await this.sendRequest('textDocument/hover', params);

    if (!result || typeof result !== 'object') {
      return { content: '' };
    }

    const hoverResult = result as Record<string, unknown>;
    const contents = hoverResult.contents;

    if (!contents) {
      return { content: '' };
    }

    let content = '';
    let range: Range | undefined;

    if (typeof contents === 'string') {
      content = contents;
    } else if (Array.isArray(contents)) {
      content = contents.map((c) => (typeof c === 'string' ? c : c.value || '')).join('\n');
    } else if (typeof contents === 'object') {
      const contentObj = contents as Record<string, unknown>;
      // Handle MarkupContent format: { kind: 'markdown' | 'plaintext', value: string }
      if ('value' in contentObj && typeof contentObj.value === 'string') {
        content = contentObj.value;
      } else if ('kind' in contentObj && 'value' in contentObj) {
        content = String(contentObj.value);
      } else {
        // Fallback for MarkedString format
        const value = contentObj.value;
        content = typeof value === 'string' ? value : '';
      }
    }

    if (hoverResult.range) {
      const r = hoverResult.range as Record<string, unknown>;
      const start = r.start as Position;
      const end = r.end as Position;
      range = {
        start: { line: start.line + 1, character: start.character + 1 },
        end: { line: end.line + 1, character: end.character + 1 },
      };
    }

    return { content, range };
  }

  async getDocumentSymbols(uri: string): Promise<DocumentSymbolResult> {
    const params = {
      textDocument: {
        uri,
      },
    };

    const result = await this.sendRequest('textDocument/documentSymbol', params);

    if (!result || !Array.isArray(result)) {
      return [];
    }

    const symbols: DocumentSymbolResult = [];

    for (const symbol of result) {
      this.collectSymbols(symbol as Record<string, unknown>, uri, undefined, symbols);
    }

    return symbols;
  }

  private collectSymbols(
    sym: Record<string, unknown>,
    uri: string,
    containerName: string | undefined,
    symbols: DocumentSymbolResult,
  ): void {
    if (sym.location) {
      symbols.push({
        name: sym.name as string,
        kind: sym.kind as number,
        location: this.normalizeLocation(sym.location),
        containerName: sym.containerName as string | undefined,
      });
    } else if (sym.range) {
      const range = this.normalizeRange(sym.range as Record<string, unknown>);
      symbols.push({
        name: sym.name as string,
        kind: sym.kind as number,
        location: { uri, range },
        containerName,
      });

      if (Array.isArray(sym.children)) {
        for (const child of sym.children) {
          this.collectSymbols(child as Record<string, unknown>, uri, sym.name as string, symbols);
        }
      }
    }
  }

  private normalizeRange(range: Record<string, unknown>): Range {
    const start = range.start as Position;
    const end = range.end as Position;
    return {
      start: { line: start.line + 1, character: start.character + 1 },
      end: { line: end.line + 1, character: end.character + 1 },
    };
  }

  protected async sendRequest(method: string, params: unknown): Promise<unknown> {
    const id = ++this.requestId;

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });

      const message = {
        jsonrpc: '2.0',
        id,
        method,
        params,
      };

      try {
        this.sendMessage(message);
      } catch (err) {
        this.pendingRequests.delete(id);
        reject(err);
      }
    });
  }

  protected sendNotification(method: string, params: unknown): void {
    const message = {
      jsonrpc: '2.0',
      method,
      params,
    };

    this.sendMessage(message);
  }

  protected sendMessage(message: object): void {
    if (!this.process || !this.process.stdin) {
      throw new Error('LSP process is not running');
    }

    const content = JSON.stringify(message);
    const header = `Content-Length: ${Buffer.byteLength(content)}\r\n\r\n`;

    this.process.stdin.write(header + content);
  }

  protected handleData(data: Buffer): void {
    this.buffer += data.toString();

    while (this.buffer.length > 0) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n');

      if (headerEnd === -1) {
        break;
      }

      const header = this.buffer.slice(0, headerEnd);
      const bodyStart = headerEnd + 4;

      const contentLengthMatch = header.match(/Content-Length:\s*(\d+)/i);

      if (!contentLengthMatch) {
        console.error(`[${this.languageId} LSP] missing Content-Length header`);
        this.buffer = this.buffer.slice(bodyStart);
        continue;
      }

      const contentLength = parseInt(contentLengthMatch[1], 10);

      if (this.buffer.length < bodyStart + contentLength) {
        break;
      }

      const body = this.buffer.slice(bodyStart, bodyStart + contentLength);
      this.buffer = this.buffer.slice(bodyStart + contentLength);

      try {
        const parsed = JSON.parse(body);

        if ('id' in parsed) {
          this.handleResponse(parsed);
        } else {
          this.handleNotification(parsed);
        }
      } catch (err) {
        console.error(`[${this.languageId} LSP] failed to parse message:`, err);
      }
    }
  }

  protected handleResponse(response: Record<string, unknown>): void {
    const id = response.id;

    if (typeof id !== 'number') {
      return;
    }

    const pending = this.pendingRequests.get(id);

    if (!pending) {
      console.warn(`[${this.languageId} LSP] received response for unknown request ${id}`);
      return;
    }

    this.pendingRequests.delete(id);

    if ('error' in response) {
      const error = response.error as Record<string, unknown>;
      pending.reject(new Error(error.message as string));
    } else {
      pending.resolve(response.result);
    }
  }

  protected handleNotification(notification: Record<string, unknown>): void {
    const method = notification.method as string;

    if (method === 'textDocument/publishDiagnostics') {
      // Handle diagnostics if needed
    }
  }

  protected async initialize(workspaceRoot: string): Promise<void> {
    const params = {
      processId: process.pid,
      rootUri: pathToFileURL(workspaceRoot).href,
      capabilities: {
        textDocument: {
          hover: {
            contentFormat: ['markdown', 'plaintext'],
          },
          definition: {
            linkSupport: true,
          },
          references: {},
        },
      },
      initializationOptions: this.getInitializeOptions(),
    };

    const result = await this.sendRequest('initialize', params);

    if (result && typeof result === 'object') {
      this.capabilities = result as Record<string, unknown>;
    }

    this.sendNotification('initialized', null);
  }

  protected normalizeLocation(location: unknown): Location {
    const loc = location as Record<string, unknown>;

    let uri = '';

    // Handle Location format (uri property)
    if (typeof loc.uri === 'string') {
      uri = loc.uri;
    } else if (loc.uri && typeof loc.uri === 'object') {
      const uriObj = loc.uri as Record<string, unknown>;
      uri = uriObj.uri as string;
    }
    // Handle LocationLink format (targetUri property)
    else if (typeof loc.targetUri === 'string') {
      uri = loc.targetUri;
    }

    let range: Range = {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 0 },
    };

    // Handle Location format (range property)
    if (loc.range) {
      const r = loc.range as Record<string, unknown>;
      const start = r.start as Position;
      const end = r.end as Position;
      range = {
        start: { line: start.line + 1, character: start.character + 1 },
        end: { line: end.line + 1, character: end.character + 1 },
      };
    }
    // Handle LocationLink format (targetSelectionRange preferred, fallback to targetRange)
    else if (loc.targetSelectionRange) {
      const r = loc.targetSelectionRange as Record<string, unknown>;
      const start = r.start as Position;
      const end = r.end as Position;
      range = {
        start: { line: start.line + 1, character: start.character + 1 },
        end: { line: end.line + 1, character: end.character + 1 },
      };
    } else if (loc.targetRange) {
      const r = loc.targetRange as Record<string, unknown>;
      const start = r.start as Position;
      const end = r.end as Position;
      range = {
        start: { line: start.line + 1, character: start.character + 1 },
        end: { line: end.line + 1, character: end.character + 1 },
      };
    }

    return { uri, range };
  }
}
