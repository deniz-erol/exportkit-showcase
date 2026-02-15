# ExportKit — Portfolio Showcase

> **Note:** This is a curated portfolio showcase. Implementation details have been redacted. For the full codebase, please contact me directly.
>

## Sample Screenshots (Subject to change)

<img width="2160" height="1440" alt="image" src="https://github.com/user-attachments/assets/fba1cf88-936d-4f22-8505-9600bfea410d" />
<img width="2160" height="1440" alt="image" src="https://github.com/user-attachments/assets/162cdaaa-873d-4363-95f1-4b3ee5cde075" />
<img width="2160" height="1440" alt="image" src="https://github.com/user-attachments/assets/ac41b25c-2380-46be-9b93-de3f7726cf82" />


## Overview

Production-ready data export API for SaaS teams. Drop-in CSV, JSON, and Excel exports with progress tracking, webhook delivery, and email notifications.

## Architecture

```mermaid
flowchart LR
    A[API Server<br/>Express :3000] --> D[(Neon Postgres)]
    B[BullMQ Worker<br/>Job Processor] --> D
    C[Dashboard<br/>Next.js :3001] --> D
    A --> E[(Redis)]
    B --> E
    A --> F[Cloudflare R2<br/>Object Storage]
    B --> F
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 20+, TypeScript 5.3+, ESM |
| API | Express 4, Zod, Helmet |
| Database | Prisma ORM, Neon Postgres |
| Queue | BullMQ, Redis |
| Storage | Cloudflare R2 |
| Email | Resend + React Email |
| Excel | ExcelJS streaming |
| Billing | Stripe |
| Dashboard | Next.js 15, NextAuth, Tailwind |
| Testing | Vitest, fast-check |

## Key Decisions

| Decision | Rationale |
|----------|-----------|
| BullMQ over SQS | Self-hosted Redis, more control |
| R2 over S3 | 90% cheaper egress |
| Cursor-based streaming | Memory-safe for any dataset size |
| ExcelJS WorkbookWriter | Streaming prevents OOM |
| Circuit breaker middleware | Prevents cascade failures |

## License

MIT

---

*Service implementations, route handlers, and component internals have been redacted.*
