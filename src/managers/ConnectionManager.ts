import { IDatabaseConnector } from '../connectors/IDatabaseConnector';
import { ConnectorFactory } from '../connectors/ConnectorFactory';
import { ConnectionConfig } from '../models/connection';

export class ConnectionManager {
    private static instance: ConnectionManager;
    private connections: Map<string, IDatabaseConnector> = new Map();

    private constructor() {}

    static getInstance(): ConnectionManager {
        if (!ConnectionManager.instance) {
            ConnectionManager.instance = new ConnectionManager();
        }
        return ConnectionManager.instance;
    }

    async connect(config: ConnectionConfig): Promise<void> {
        const connector = ConnectorFactory.createConnector(config);
        await connector.connect();
        this.connections.set(config.id, connector);
    }

    async disconnect(connectionId: string): Promise<void> {
        const connector = this.connections.get(connectionId);
        if (connector) {
            await connector.disconnect();
            this.connections.delete(connectionId);
        }
    }

    async disconnectAll(): Promise<void> {
        const disconnectPromises = Array.from(this.connections.values()).map(
            conn => conn.disconnect()
        );
        await Promise.all(disconnectPromises);
        this.connections.clear();
    }

    getConnection(connectionId: string): IDatabaseConnector | undefined {
        return this.connections.get(connectionId);
    }

    isConnected(connectionId: string): boolean {
        const connector = this.connections.get(connectionId);
        return connector ? connector.isConnected() : false;
    }

    async testConnection(config: ConnectionConfig): Promise<boolean> {
        const connector = ConnectorFactory.createConnector(config);
        return await connector.testConnection();
    }
}
