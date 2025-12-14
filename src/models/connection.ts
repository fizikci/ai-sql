export enum DatabaseType {
    MSSQL = 'mssql',
    PostgreSQL = 'postgresql',
    MySQL = 'mysql'
}

export interface ConnectionConfig {
    id: string;
    name: string;
    type: DatabaseType;
    host: string;
    port: number;
    username: string;
    password: string;
    database?: string;
    ssl?: boolean;
}

export interface DatabaseObject {
    name: string;
    schema?: string;
    type: 'database' | 'table' | 'view' | 'procedure' | 'function' | 'column' | 'index' | 'constraint';
}

export interface Column {
    name: string;
    dataType: string;
    nullable: boolean;
    defaultValue?: string;
    maxLength?: number;
    precision?: number;
    scale?: number;
    isPrimaryKey: boolean;
    isForeignKey: boolean;
    isIdentity?: boolean;
}

export interface Index {
    name: string;
    columns: string[];
    isUnique: boolean;
    isPrimaryKey: boolean;
    type?: string;
}

export interface Constraint {
    name: string;
    type: 'PRIMARY KEY' | 'FOREIGN KEY' | 'UNIQUE' | 'CHECK' | 'DEFAULT';
    columns: string[];
    referencedTable?: string;
    referencedColumns?: string[];
    definition?: string;
}

export interface TableDetails {
    name: string;
    schema?: string;
    columns: Column[];
    indexes: Index[];
    constraints: Constraint[];
}
