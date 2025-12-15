import { IDatabaseConnector } from '../connectors/IDatabaseConnector';
import { DatabaseObject, TableDetails } from '../models/connection';

export interface SchemaContextOptions {
    /** Upper bound for number of tables to include in the context. */
    maxTables?: number;
    /** Upper bound for number of columns per table. */
    maxColumnsPerTable?: number;
}

export class SchemaContextService {
    private asStringArray(value: unknown): string[] {
        if (Array.isArray(value)) {
            return value.map(v => String(v));
        }
        if (typeof value === 'string') {
            const raw = value.trim();
            if (!raw) {
                return [];
            }
            return raw.split(',').map(s => s.trim()).filter(Boolean);
        }
        return [];
    }

    async buildSchemaContext(
        connector: IDatabaseConnector,
        database: string | undefined,
        options: SchemaContextOptions = {}
    ): Promise<string> {
        const maxTables = options.maxTables ?? 80;
        const maxColumnsPerTable = options.maxColumnsPerTable ?? 80;

        // 1) List tables
        const tables = (await connector.getTables(database)).slice(0, maxTables);

        // 2) Fetch details in parallel with a simple concurrency limit
        const details: TableDetails[] = await this.mapWithConcurrency(tables, 6, async (t) => {
            return connector.getTableDetails(t.name, t.schema);
        });

        // 3) Format compact schema context with PK/FK relationships
        // Keep it deterministic and LLM-friendly.
        const lines: string[] = [];
        if (database) {
            lines.push(`DATABASE: ${database}`);
        } else {
            lines.push('DATABASE: (not specified)');
        }
        lines.push('');
        lines.push('TABLES:');

        for (const td of details.sort(this.tableSort)) {
            const fq = td.schema ? `${td.schema}.${td.name}` : td.name;
            lines.push(`- ${fq}`);

            const cols = (td.columns ?? []).slice(0, maxColumnsPerTable);
            if (cols.length) {
                lines.push('  columns:');
                for (const c of cols) {
                    const flags: string[] = [];
                    if (!c.nullable) {
                        flags.push('NOT NULL');
                    }
                    if (c.isPrimaryKey) {
                        flags.push('PK');
                    }
                    if (c.isForeignKey) {
                        flags.push('FK');
                    }
                    if (c.isIdentity) {
                        flags.push('IDENTITY');
                    }
                    const flagStr = flags.length ? ` [${flags.join(', ')}]` : '';
                    lines.push(`    - ${c.name}: ${c.dataType}${flagStr}`);
                }
            }

            // Constraints section: highlight PK + FK
            const constraints = td.constraints ?? [];
            const pk = constraints.filter(c => c.type === 'PRIMARY KEY');
            const fks = constraints.filter(c => c.type === 'FOREIGN KEY');

            if (pk.length) {
                lines.push('  primary_key:');
                for (const p of pk) {
                    lines.push(`    - ${p.name}: (${this.asStringArray((p as any).columns).join(', ')})`);
                }
            }

            if (fks.length) {
                lines.push('  foreign_keys:');
                for (const fk of fks) {
                    const to = fk.referencedTable ? fk.referencedTable : '(unknown)';
                    const fromCols = this.asStringArray((fk as any).columns).join(', ');
                    const toCols = this.asStringArray((fk as any).referencedColumns).join(', ');
                    lines.push(`    - ${fk.name}: (${fromCols}) -> ${to}(${toCols})`);
                }
            }

            lines.push('');
        }

        return lines.join('\n');
    }

    private tableSort(a: TableDetails, b: TableDetails): number {
        const as = (a.schema ?? '').toLowerCase();
        const bs = (b.schema ?? '').toLowerCase();
        if (as !== bs) {
            return as.localeCompare(bs);
        }
        return (a.name ?? '').toLowerCase().localeCompare((b.name ?? '').toLowerCase());
    }

    private async mapWithConcurrency<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
        const results: R[] = new Array(items.length);
        let idx = 0;

        const workers = new Array(Math.max(1, concurrency)).fill(0).map(async () => {
            while (true) {
                const i = idx++;
                if (i >= items.length) {
                    return;
                }
                results[i] = await fn(items[i]);
            }
        });

        await Promise.all(workers);
        return results;
    }
}
