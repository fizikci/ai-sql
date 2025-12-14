// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { ConnectionStorage } from './storage/connectionStorage';
import { ConnectionManager } from './managers/ConnectionManager';
import { SqlExplorerProvider } from './providers/SqlExplorerProvider';
import { QueryResultProvider } from './providers/QueryResultProvider';
import { CommandHandler } from './commands/CommandHandler';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	console.log('SQL Client extension is now active!');

	// Initialize services
	const connectionStorage = new ConnectionStorage(context);
	const connectionManager = ConnectionManager.getInstance();
	const explorerProvider = new SqlExplorerProvider(connectionStorage, connectionManager);
	const queryResultProvider = new QueryResultProvider(context);
	const commandHandler = new CommandHandler(
		context,
		connectionStorage,
		connectionManager,
		explorerProvider,
		queryResultProvider
	);

	// Register tree view
	const treeView = vscode.window.createTreeView('sqlExplorer', {
		treeDataProvider: explorerProvider,
		showCollapseAll: true
	});
	context.subscriptions.push(treeView);

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

	vscode.window.showInformationMessage('SQL Client is ready!');
}

// This method is called when your extension is deactivated
export async function deactivate() {
	const connectionManager = ConnectionManager.getInstance();
	await connectionManager.disconnectAll();
}

