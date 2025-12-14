import { IDatabaseConnector } from './IDatabaseConnector';
import { MSSQLConnector } from './MSSQLConnector';
import { PostgreSQLConnector } from './PostgreSQLConnector';
import { MySQLConnector } from './MySQLConnector';
import { ConnectionConfig, DatabaseType } from '../models/connection';

export class ConnectorFactory {
    static createConnector(config: ConnectionConfig): IDatabaseConnector {
        switch (config.type) {
            case DatabaseType.MSSQL:
                return new MSSQLConnector(config);
            case DatabaseType.PostgreSQL:
                return new PostgreSQLConnector(config);
            case DatabaseType.MySQL:
                return new MySQLConnector(config);
            default:
                throw new Error(`Unsupported database type: ${config.type}`);
        }
    }
}
