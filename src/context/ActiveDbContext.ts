import * as vscode from 'vscode';

export interface ActiveDbContextValue {
    connectionId: string;
    /** Optional. If undefined, indicates connection-level context (no specific DB chosen). */
    database?: string;
}

const WORKSPACE_STATE_KEY = 'sql-client.activeDbContext';
const LAST_DB_BY_CONNECTION_KEY = 'sql-client.lastDatabaseByConnection';

export class ActiveDbContext {
    static get(context: vscode.ExtensionContext): ActiveDbContextValue | undefined {
        return context.workspaceState.get<ActiveDbContextValue>(WORKSPACE_STATE_KEY);
    }

    static getLastDatabaseForConnection(context: vscode.ExtensionContext, connectionId: string): string | undefined {
        const map = context.workspaceState.get<Record<string, string>>(LAST_DB_BY_CONNECTION_KEY) ?? {};
        return map[connectionId];
    }

    static async rememberLastDatabaseForConnection(
        context: vscode.ExtensionContext,
        connectionId: string,
        database: string
    ): Promise<void> {
        const map = context.workspaceState.get<Record<string, string>>(LAST_DB_BY_CONNECTION_KEY) ?? {};
        map[connectionId] = database;
        await context.workspaceState.update(LAST_DB_BY_CONNECTION_KEY, map);
    }

    static async set(context: vscode.ExtensionContext, value: ActiveDbContextValue | undefined): Promise<void> {
        await context.workspaceState.update(WORKSPACE_STATE_KEY, value);

        if (value?.connectionId && value.database) {
            await ActiveDbContext.rememberLastDatabaseForConnection(context, value.connectionId, value.database);
        }

        // Also set VS Code context keys so menus/commands can be enabled/disabled.
        await vscode.commands.executeCommand('setContext', 'sqlClient.hasActiveConnection', !!value?.connectionId);
        await vscode.commands.executeCommand('setContext', 'sqlClient.hasActiveDatabase', !!value?.connectionId && !!value?.database);
    }
}
