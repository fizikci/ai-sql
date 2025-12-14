import { TableDetails, DatabaseObject, Column, Index, Constraint } from '../models/connection';

export interface QueryResult {
    columns: string[];
    rows: any[];
    rowCount: number;
    executionTime: number;
}

export interface IDatabaseConnector {
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    isConnected(): boolean;
    executeQuery(query: string): Promise<QueryResult>;
    getDatabases(): Promise<string[]>;
    getTables(database?: string): Promise<DatabaseObject[]>;
    getViews(database?: string): Promise<DatabaseObject[]>;
    getProcedures(database?: string): Promise<DatabaseObject[]>;
    getFunctions(database?: string): Promise<DatabaseObject[]>;
    getTableDetails(tableName: string, schema?: string): Promise<TableDetails>;
    getColumns(tableName: string, schema?: string): Promise<Column[]>;
    getIndexes(tableName: string, schema?: string): Promise<Index[]>;
    getConstraints(tableName: string, schema?: string): Promise<Constraint[]>;
    testConnection(): Promise<boolean>;
}
