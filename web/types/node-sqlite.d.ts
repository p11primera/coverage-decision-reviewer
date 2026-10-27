// Minimal ambient types for node:sqlite — the installed @types/node (v20, pinned by the
// create-next-app scaffold) predates node:sqlite's typings (Node 22.5+). We run Node 26
// where the module exists at runtime; declaring the tiny surface we use avoids an
// unnecessary devDependency bump for one read-only page.

declare module "node:sqlite" {
  export interface StatementSync {
    all(...anonymousParameters: unknown[]): Record<string, unknown>[];
    get(...anonymousParameters: unknown[]): Record<string, unknown> | undefined;
    run(...anonymousParameters: unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint };
  }

  export class DatabaseSync {
    constructor(path: string, options?: { open?: boolean; readOnly?: boolean; enableForeignKeyConstraints?: boolean });
    prepare(statement: string): StatementSync;
    exec(statement: string): void;
    close(): void;
  }
}
