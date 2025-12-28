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

    /**
     * Build a SQL query to fetch table rows for the connector's SQL dialect.
     * Implementations must properly quote identifiers.
     */
    getTableDataQuery(tableName: string, schema?: string, limit?: number): string;
    getRenameTableQuery(tableName: string, newName: string, schema?: string, database?: string): string;
    getDropTableQuery(tableName: string, schema?: string, database?: string): string;
    getRenameViewQuery(viewName: string, newName: string, schema?: string, database?: string): string;
    getDropViewQuery(viewName: string, schema?: string, database?: string): string;
    getRenameColumnQuery(tableName: string, columnName: string, newName: string, schema?: string, database?: string): string;
    getDropColumnQuery(tableName: string, columnName: string, schema?: string, database?: string): string;

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
