// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { ConnectionStorage } from './storage/connectionStorage';
import { ConnectionManager } from './managers/ConnectionManager';
import { SqlExplorerProvider, TreeNode } from './providers/SqlExplorerProvider';
import { QueryResultProvider } from './providers/QueryResultProvider';
import { ViewDataProvider } from './providers/ViewDataProvider';
import { CommandHandler } from './commands/CommandHandler';
import { ActiveDbContext } from './context/ActiveDbContext';
import { AiSqlChatParticipant } from './chat/AiSqlChatParticipant';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	console.log('SQL Client extension is now active!');

	// Initialize services
	const connectionStorage = new ConnectionStorage(context);
	const connectionManager = ConnectionManager.getInstance();
	const explorerProvider = new SqlExplorerProvider(connectionStorage, connectionManager);
	const queryResultProvider = new QueryResultProvider(context);
	const viewDataProvider = new ViewDataProvider(context, connectionStorage, connectionManager);
	const commandHandler = new CommandHandler(
		context,
		connectionStorage,
		connectionManager,
		explorerProvider,
		queryResultProvider,
		viewDataProvider
	);

	// Register tree view
	const treeView = vscode.window.createTreeView<TreeNode>('sqlExplorer', {
		treeDataProvider: explorerProvider,
		showCollapseAll: true,
		dragAndDropController: explorerProvider
	});
	context.subscriptions.push(treeView);

	// Auto-connect when a connection node is expanded.
	// This removes the friction of needing to right-click > Connect before databases load.
	const autoConnectInFlight = new Map<string, Promise<void>>();
	const ensureConnected = async (node: TreeNode): Promise<void> => {
		if (!node.connectionId) {
			return;
		}
		if (connectionManager.isConnected(node.connectionId)) {
			return;
		}

		const existing = autoConnectInFlight.get(node.connectionId);
		if (existing) {
			await existing;
			return;
		}

		const task = (async () => {
			const connection = await connectionStorage.getConnection(node.connectionId!);
			if (!connection) {
				return;
			}

			try {
				await vscode.window.withProgress(
					{
						location: vscode.ProgressLocation.Notification,
						title: `Connecting to ${connection.name}...`,
						cancellable: false
					},
					async () => {
						await connectionManager.connect(connection);
					}
				);
				// Refresh so connection indicator and children update.
				explorerProvider.refresh();
			} catch (error: any) {
				const message = error?.message ?? String(error);
				vscode.window.showErrorMessage(`Failed to connect: ${message}`);
			}
		})();

		autoConnectInFlight.set(node.connectionId, task);
		try {
			await task;
		} finally {
			autoConnectInFlight.delete(node.connectionId);
		}
	};

	context.subscriptions.push(
		treeView.onDidExpandElement(async (e) => {
			const node = e.element;
			if (node?.contextValue !== 'connection') {
				return;
			}
			await ensureConnected(node);
		})
	);

	// Track selection so AI/features can use current connection/database context.
	context.subscriptions.push(
		treeView.onDidChangeSelection(async (e) => {
			const node = e.selection?.[0];
			if (!node?.connectionId) {
				await ActiveDbContext.set(context, undefined);
				return;
			}

			// Persist connection always; include database when available.
			// Some child items might not carry database info in the selection; fall back to last chosen database.
			const database = node.database
				?? ActiveDbContext.getLastDatabaseForConnection(context, node.connectionId);
			await ActiveDbContext.set(context, {
				connectionId: node.connectionId,
				database
			});
		})
	);

	// Register AI SQL chat participant (requires newer VS Code/Copilot APIs).
	try {
		context.subscriptions.push(
			AiSqlChatParticipant.register(context, connectionStorage, connectionManager)
		);
	} catch (e) {
		// Ignore if running on a VS Code version that doesn't support chat APIs.
		console.log('[ai-sql] Chat participant not available:', e);
	}

	// Register commands
	context.subscriptions.push(
		vscode.commands.registerCommand('sql-client.addConnection', () => 
			commandHandler.addConnection()
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('sql-client.editConnection', (node) => 
			commandHandler.editConnection(node)
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('sql-client.deleteConnection', (node) => 
			commandHandler.deleteConnection(node)
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('sql-client.refreshConnection', () => 
			explorerProvider.refresh()
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('sql-client.refreshExplorer', () => 
			explorerProvider.refresh()
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('sql-client.newQuery', (node) => 
			commandHandler.newQuery(node)
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('sql-client.executeQuery', () => 
			commandHandler.executeQuery()
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('sql-client.connectDatabase', (node) => 
			commandHandler.connectDatabase(node)
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('sql-client.disconnectDatabase', (node) => 
			commandHandler.disconnectDatabase(node)
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('sql-client.viewTableData', (node) => 
			commandHandler.viewTableData(node)
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('sql-client.editTable', (node) => 
			commandHandler.editTable(node)
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('sql-client.groupTable', (node) =>
			commandHandler.groupTable(node)
		)
	);

	vscode.window.showInformationMessage('SQL Client is ready!');
}

// This method is called when your extension is deactivated
export async function deactivate() {
	const connectionManager = ConnectionManager.getInstance();
	await connectionManager.disconnectAll();
}

