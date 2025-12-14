import * as vscode from 'vscode';
import { ConnectionConfig } from '../models/connection';

export class ConnectionStorage {
    private static readonly STORAGE_KEY = 'sql-client.connections';
    
    constructor(private context: vscode.ExtensionContext) {}

    async getConnections(): Promise<ConnectionConfig[]> {
        const connections = this.context.globalState.get<ConnectionConfig[]>(ConnectionStorage.STORAGE_KEY, []);
        // Decrypt passwords if needed
        return connections;
    }

    async saveConnection(connection: ConnectionConfig): Promise<void> {
        const connections = await this.getConnections();
        const existingIndex = connections.findIndex(c => c.id === connection.id);
        
        if (existingIndex >= 0) {
            connections[existingIndex] = connection;
        } else {
            connections.push(connection);
        }
        
        await this.context.globalState.update(ConnectionStorage.STORAGE_KEY, connections);
    }

    async deleteConnection(id: string): Promise<void> {
        const connections = await this.getConnections();
        const filtered = connections.filter(c => c.id !== id);
        await this.context.globalState.update(ConnectionStorage.STORAGE_KEY, filtered);
    }

    async updateConnection(id: string, updates: Partial<ConnectionConfig>): Promise<void> {
        const connections = await this.getConnections();
        const connection = connections.find(c => c.id === id);
        
        if (connection) {
            Object.assign(connection, updates);
            await this.context.globalState.update(ConnectionStorage.STORAGE_KEY, connections);
        }
    }

    async getConnection(id: string): Promise<ConnectionConfig | undefined> {
        const connections = await this.getConnections();
        return connections.find(c => c.id === id);
    }
}
