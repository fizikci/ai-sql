import * as vscode from 'vscode';
import { ConnectionConfig, DatabaseType } from '../models/connection';
import { ConnectionStorage } from '../storage/connectionStorage';
import { ConnectionManager } from '../managers/ConnectionManager';
import { ConnectorFactory } from '../connectors/ConnectorFactory';
import { IDatabaseConnector } from '../connectors/IDatabaseConnector';
import { SqlExplorerProvider, TreeNode } from '../providers/SqlExplorerProvider';
import { QueryResultProvider } from '../providers/QueryResultProvider';
import { ViewDataProvider } from '../providers/ViewDataProvider';
import { AggregateDataProvider } from '../providers/AggregateDataProvider';
import { MetadataStorage } from '../storage/metadataStorage';
import { ActiveDbContext } from '../context/ActiveDbContext';

export class CommandHandler {
    private readonly metadataStorage = new MetadataStorage();
    private readonly connectInFlight = new Map<string, Promise<void>>();

    constructor(
        private context: vscode.ExtensionContext,
        private connectionStorage: ConnectionStorage,
        private connectionManager: ConnectionManager,
        private explorerProvider: SqlExplorerProvider,
        private queryResultProvider: QueryResultProvider,
        private viewDataProvider: ViewDataProvider,
        private aggregateDataProvider: AggregateDataProvider
    ) {}

    private async ensureConnected(connectionId: string): Promise<void> {
        if (this.connectionManager.isConnected(connectionId)) {
            return;
        }

        const existing = this.connectInFlight.get(connectionId);
        if (existing) {
            await existing;
            return;
        }

        const task = (async () => {
            const connection = await this.connectionStorage.getConnection(connectionId);
            if (!connection) {
                throw new Error('Connection not found');
            }

            await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: `Connecting to ${connection.name}...`,
                    cancellable: false
                },
                async () => {
                    await this.connectionManager.connect(connection);
                }
            );
        })();

        this.connectInFlight.set(connectionId, task);
        try {
            await task;
        } finally {
            this.connectInFlight.delete(connectionId);
        }
    }

    async groupTable(node: TreeNode): Promise<void> {
        if (!node.connectionId || !node.objectName) {
            return;
        }

        const current = await this.metadataStorage.getTableGroup(node.connectionId, node.database, node.schema, node.objectName);

        const groupName = await vscode.window.showInputBox({
            prompt: 'Group name for this table (default: Others)',
            value: current || 'Others',
            placeHolder: 'Others'
        });

        if (groupName === undefined) {
            return;
        }

        const normalized = String(groupName).trim();
        // Empty or "Others" means: not set (default).
        const toStore = !normalized || normalized.toLowerCase() === 'others' ? 'Others' : normalized;

        await this.metadataStorage.setTableGroup(node.connectionId, node.database, node.schema, node.objectName, toStore);
        this.explorerProvider.refresh();
    }

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
        const inferredConnectionId = node?.connectionId
            ?? ActiveDbContext.get(this.context)?.connectionId;

        if (inferredConnectionId && !this.connectionManager.isConnected(inferredConnectionId)) {
            try {
                await this.ensureConnected(inferredConnectionId);
                this.explorerProvider.refresh();
            } catch (error: any) {
                const message = error?.message ?? String(error);
                vscode.window.showErrorMessage(`Failed to connect: ${message}`);
            }
        }

        const doc = await vscode.workspace.openTextDocument({
            language: 'sql',
            content: `SELECT
    * 
FROM 
    tableName 
WHERE 
    condition
ORDER BY
    fieldName;`
        });
        
        await vscode.window.showTextDocument(doc);

        // Store connection context if node is provided
        if (inferredConnectionId) {
            this.context.workspaceState.update(
                `activeConnection:${doc.uri.toString()}`,
                inferredConnectionId
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

        const tableDisplayName = node.schema ? `${node.schema}.${node.objectName}` : node.objectName;
        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Opening data view for ${tableDisplayName}...`,
                cancellable: false
            }, async () => {
                await this.viewDataProvider.showTable(node.connectionId!, node.database, node.schema, node.objectName!);
            });
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to open View Data: ${error}`);
        }
    }

    async aggregateTableData(node: TreeNode): Promise<void> {
        if (!node.connectionId || !node.objectName) {
            return;
        }

        const tableDisplayName = node.schema ? `${node.schema}.${node.objectName}` : node.objectName;
        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Opening aggregate view for ${tableDisplayName}...`,
                cancellable: false
            }, async () => {
                await this.aggregateDataProvider.showTable(node.connectionId!, node.database, node.schema, node.objectName!);
            });
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to open Aggregate View: ${error}`);
        }
    }

    async aggregateFieldData(node: TreeNode): Promise<void> {
        if (!node.connectionId || !node.objectName || !node.tableName) {
            return;
        }

        const tableDisplayName = node.schema ? `${node.schema}.${node.tableName}` : node.tableName;
        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Opening aggregate view for ${tableDisplayName}...`,
                cancellable: false
            }, async () => {
                await this.aggregateDataProvider.showTable(
                    node.connectionId!,
                    node.database,
                    node.schema,
                    node.tableName!,
                    {
                        initialAggregations: [{ field: node.objectName, func: 'none' }],
                        includeCountAll: true
                    }
                );
            });
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to open Aggregate View: ${error}`);
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

    private async openSqlDocument(sql: string, connectionId?: string): Promise<void> {
        const doc = await vscode.workspace.openTextDocument({
            language: 'sql',
            content: sql
        });

        await vscode.window.showTextDocument(doc);

        if (connectionId) {
            this.context.workspaceState.update(
                `activeConnection:${doc.uri.toString()}`,
                connectionId
            );
        }
    }

    private async getSqlConnector(connectionId: string): Promise<IDatabaseConnector | undefined> {
        const existing = this.connectionManager.getConnection(connectionId);
        if (existing) {
            return existing;
        }

        const connection = await this.connectionStorage.getConnection(connectionId);
        if (!connection) {
            return undefined;
        }

        return ConnectorFactory.createConnector(connection);
    }

    async renameTable(node: TreeNode): Promise<void> {
        if (!node.connectionId || !node.objectName) {
            return;
        }

        const newName = await vscode.window.showInputBox({
            prompt: `New name for table "${node.objectName}"`,
            value: node.objectName
        });

        if (!newName || newName.trim() === node.objectName) {
            return;
        }

        const connector = await this.getSqlConnector(node.connectionId);
        if (!connector) {
            vscode.window.showErrorMessage('Connection not found');
            return;
        }

        const sql = connector.getRenameTableQuery(
            node.objectName,
            newName.trim(),
            node.schema,
            node.database
        );

        await this.openSqlDocument(sql, node.connectionId);
    }

    async dropTable(node: TreeNode): Promise<void> {
        if (!node.connectionId || !node.objectName) {
            return;
        }

        const connector = await this.getSqlConnector(node.connectionId);
        if (!connector) {
            vscode.window.showErrorMessage('Connection not found');
            return;
        }

        const sql = connector.getDropTableQuery(
            node.objectName,
            node.schema,
            node.database
        );

        await this.openSqlDocument(sql, node.connectionId);
    }

    async renameView(node: TreeNode): Promise<void> {
        if (!node.connectionId || !node.objectName) {
            return;
        }

        const newName = await vscode.window.showInputBox({
            prompt: `New name for view "${node.objectName}"`,
            value: node.objectName
        });

        if (!newName || newName.trim() === node.objectName) {
            return;
        }

        const connector = await this.getSqlConnector(node.connectionId);
        if (!connector) {
            vscode.window.showErrorMessage('Connection not found');
            return;
        }

        const sql = connector.getRenameViewQuery(
            node.objectName,
            newName.trim(),
            node.schema,
            node.database
        );

        await this.openSqlDocument(sql, node.connectionId);
    }

    async dropView(node: TreeNode): Promise<void> {
        if (!node.connectionId || !node.objectName) {
            return;
        }

        const connector = await this.getSqlConnector(node.connectionId);
        if (!connector) {
            vscode.window.showErrorMessage('Connection not found');
            return;
        }

        const sql = connector.getDropViewQuery(
            node.objectName,
            node.schema,
            node.database
        );

        await this.openSqlDocument(sql, node.connectionId);
    }

    async renameColumn(node: TreeNode): Promise<void> {
        if (!node.connectionId || !node.objectName || !node.tableName) {
            return;
        }

        const newName = await vscode.window.showInputBox({
            prompt: `New name for column "${node.objectName}"`,
            value: node.objectName
        });

        if (!newName || newName.trim() === node.objectName) {
            return;
        }

        const connector = await this.getSqlConnector(node.connectionId);
        if (!connector) {
            vscode.window.showErrorMessage('Connection not found');
            return;
        }

        const sql = connector.getRenameColumnQuery(
            node.tableName,
            node.objectName,
            newName.trim(),
            node.schema,
            node.database
        );

        await this.openSqlDocument(sql, node.connectionId);
    }

    async dropColumn(node: TreeNode): Promise<void> {
        if (!node.connectionId || !node.objectName || !node.tableName) {
            return;
        }

        const connector = await this.getSqlConnector(node.connectionId);
        if (!connector) {
            vscode.window.showErrorMessage('Connection not found');
            return;
        }

        const sql = connector.getDropColumnQuery(
            node.tableName,
            node.objectName,
            node.schema,
            node.database
        );

        await this.openSqlDocument(sql, node.connectionId);
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
