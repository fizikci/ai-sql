import * as vscode from 'vscode';
import { ConnectionConfig, DatabaseType } from '../models/connection';
import { ConnectionStorage } from '../storage/connectionStorage';
import { ConnectionManager } from '../managers/ConnectionManager';
import { SqlExplorerProvider, TreeNode } from '../providers/SqlExplorerProvider';
import { QueryResultProvider } from '../providers/QueryResultProvider';

export class CommandHandler {
    constructor(
        private context: vscode.ExtensionContext,
        private connectionStorage: ConnectionStorage,
        private connectionManager: ConnectionManager,
        private explorerProvider: SqlExplorerProvider,
        private queryResultProvider: QueryResultProvider
    ) {}

    async addConnection(): Promise<void> {
        const name = await vscode.window.showInputBox({
            prompt: 'Connection name',
            placeHolder: 'My Database'
        });
        if (!name) {
            return;
        }

        const typeOptions = [
            { label: 'SQL Server', value: DatabaseType.MSSQL },
            { label: 'PostgreSQL', value: DatabaseType.PostgreSQL },
            { label: 'MySQL', value: DatabaseType.MySQL }
        ];

        const selectedType = await vscode.window.showQuickPick(typeOptions, {
            placeHolder: 'Select database type'
        });
        if (!selectedType) {
            return;
        }

        const host = await vscode.window.showInputBox({
            prompt: 'Host',
            placeHolder: 'localhost'
        });
        if (!host) {
            return;
        }

        const defaultPort = this.getDefaultPort(selectedType.value);
        const portInput = await vscode.window.showInputBox({
            prompt: 'Port',
            value: defaultPort.toString()
        });
        if (!portInput) {
            return;
        }
        const port = parseInt(portInput, 10);

        const username = await vscode.window.showInputBox({
            prompt: 'Username',
            placeHolder: 'sa'
        });
        if (!username) {
            return;
        }

        const password = await vscode.window.showInputBox({
            prompt: 'Password',
            password: true
        });
        if (password === undefined) {
            return;
        }

        const database = await vscode.window.showInputBox({
            prompt: 'Database (optional)',
            placeHolder: 'Leave empty to see all databases'
        });

        const connection: ConnectionConfig = {
            id: Date.now().toString(),
            name,
            type: selectedType.value,
            host,
            port,
            username,
            password,
            database: database || undefined,
            ssl: false
        };

        console.log('Testing connection with config:', {
            ...connection,
            password: '***' // Don't log password
        });

        // Test connection
        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Testing connection...',
                cancellable: false
            }, async () => {
                return await this.connectionManager.testConnection(connection);
            });

            await this.connectionStorage.saveConnection(connection);
            this.explorerProvider.refresh();
            vscode.window.showInformationMessage('Connection added successfully!');
        } catch (error: any) {
            const errorMessage = error?.message || String(error);
            vscode.window.showErrorMessage(`Connection failed: ${errorMessage}`);
            console.error('Connection error details:', error);
        }
    }

    async editConnection(node: TreeNode): Promise<void> {
        if (!node.connectionId) {
            return;
        }

        const connection = await this.connectionStorage.getConnection(node.connectionId);
        if (!connection) {
            return;
        }

        // Simple edit - just update name for now
        const name = await vscode.window.showInputBox({
            prompt: 'Connection name',
            value: connection.name
        });

        if (name && name !== connection.name) {
            connection.name = name;
            await this.connectionStorage.saveConnection(connection);
            this.explorerProvider.refresh();
        }
    }

    async deleteConnection(node: TreeNode): Promise<void> {
        if (!node.connectionId) {
            return;
        }

        const connection = await this.connectionStorage.getConnection(node.connectionId);
        if (!connection) {
            return;
        }

        const confirm = await vscode.window.showWarningMessage(
            `Delete connection "${connection.name}"?`,
            { modal: true },
            'Delete'
        );

        if (confirm === 'Delete') {
            await this.connectionManager.disconnect(node.connectionId);
            await this.connectionStorage.deleteConnection(node.connectionId);
            this.explorerProvider.refresh();
            vscode.window.showInformationMessage('Connection deleted');
        }
    }

    async connectDatabase(node: TreeNode): Promise<void> {
        if (!node.connectionId) {
            return;
        }

        const connection = await this.connectionStorage.getConnection(node.connectionId);
        if (!connection) {
            return;
        }

        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Connecting to ${connection.name}...`,
                cancellable: false
            }, async () => {
                await this.connectionManager.connect(connection);
            });

            this.explorerProvider.refresh();
            vscode.window.showInformationMessage(`Connected to ${connection.name}`);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to connect: ${error}`);
        }
    }

    async disconnectDatabase(node: TreeNode): Promise<void> {
        if (!node.connectionId) {
            return;
        }

        await this.connectionManager.disconnect(node.connectionId);
        this.explorerProvider.refresh();
        vscode.window.showInformationMessage('Disconnected');
    }

    async newQuery(node?: TreeNode): Promise<void> {
        const doc = await vscode.workspace.openTextDocument({
            language: 'sql',
            content: '-- New Query\n'
        });
        await vscode.window.showTextDocument(doc);

        // Store connection context if node is provided
        if (node?.connectionId) {
            this.context.workspaceState.update(
                `activeConnection:${doc.uri.toString()}`,
                node.connectionId
            );
        }
    }

    async executeQuery(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('No active editor');
            return;
        }

        const query = editor.selection.isEmpty 
            ? editor.document.getText() 
            : editor.document.getText(editor.selection);

        if (!query.trim()) {
            vscode.window.showWarningMessage('No query to execute');
            return;
        }

        // Get connection ID from workspace state or ask user
        let connectionId = this.context.workspaceState.get<string>(
            `activeConnection:${editor.document.uri.toString()}`
        );

        if (!connectionId) {
            const connections = await this.connectionStorage.getConnections();
            const items = connections.map(c => ({
                label: c.name,
                id: c.id
            }));

            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: 'Select connection'
            });

            if (!selected) {
                return;
            }
            connectionId = selected.id;
        }

        const connector = this.connectionManager.getConnection(connectionId);
        if (!connector) {
            // Try to connect
            const connection = await this.connectionStorage.getConnection(connectionId);
            if (connection) {
                await this.connectionManager.connect(connection);
            } else {
                vscode.window.showErrorMessage('Connection not found');
                return;
            }
        }

        try {
            const result = await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Executing query...',
                cancellable: false
            }, async () => {
                const conn = this.connectionManager.getConnection(connectionId!);
                if (!conn) {
                    throw new Error('Not connected');
                }
                return await conn.executeQuery(query);
            });

            this.queryResultProvider.showResults(result, query);
        } catch (error) {
            vscode.window.showErrorMessage(`Query failed: ${error}`);
        }
    }

    async viewTableData(node: TreeNode): Promise<void> {
        if (!node.connectionId || !node.objectName) {
            return;
        }

        const tableName = node.schema 
            ? `${node.schema}.${node.objectName}` 
            : node.objectName;

        const connector = this.connectionManager.getConnection(node.connectionId);
        if (!connector) {
            vscode.window.showWarningMessage('Not connected');
            return;
        }

        try {
            const query = `SELECT TOP 1000 * FROM ${tableName}`;
            const result = await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Loading data from ${tableName}...`,
                cancellable: false
            }, async () => {
                return await connector.executeQuery(query);
            });

            this.queryResultProvider.showResults(result, query);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to load table data: ${error}`);
        }
    }

    async editTable(node: TreeNode): Promise<void> {
        if (!node.connectionId || !node.objectName) {
            return;
        }

        const connector = this.connectionManager.getConnection(node.connectionId);
        if (!connector) {
            vscode.window.showWarningMessage('Not connected');
            return;
        }

        try {
            const tableDetails = await connector.getTableDetails(
                node.objectName,
                node.schema
            );

            const doc = await vscode.workspace.openTextDocument({
                language: 'sql',
                content: this.generateTableScript(tableDetails)
            });
            await vscode.window.showTextDocument(doc);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to load table details: ${error}`);
        }
    }

    private generateTableScript(table: any): string {
        let script = `-- Table: ${table.schema ? table.schema + '.' : ''}${table.name}\n\n`;
        
        script += '-- Columns:\n';
        table.columns.forEach((col: any) => {
            script += `-- ${col.name} ${col.dataType}${col.nullable ? ' NULL' : ' NOT NULL'}${col.isPrimaryKey ? ' PK' : ''}\n`;
        });

        script += '\n-- Indexes:\n';
        table.indexes.forEach((idx: any) => {
            script += `-- ${idx.name}: ${idx.columns.join(', ')}${idx.isUnique ? ' UNIQUE' : ''}\n`;
        });

        script += '\n-- Constraints:\n';
        table.constraints.forEach((con: any) => {
            script += `-- ${con.name} (${con.type})\n`;
        });

        return script;
    }

    private getDefaultPort(type: DatabaseType): number {
        switch (type) {
            case DatabaseType.MSSQL:
                return 1433;
            case DatabaseType.PostgreSQL:
                return 5432;
            case DatabaseType.MySQL:
                return 3306;
            default:
                return 0;
        }
    }
}
