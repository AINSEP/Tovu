### A1. Vertical Slice Architecture (Jimmy Bogard)

**What it is:** Organize code by feature/operation rather than by horizontal technical layer. Every feature owns its own handler, validation, and data access in one place.

```
Traditional Layers:              Vertical Slices:

├── controllers/                 ├── features/
│   ├── invoice.ts               │   ├── create-invoice/
│   └── customer.ts              │   │   ├── handler.ts
├── services/                    │   │   ├── validator.ts
│   └── invoice.ts               │   │   └── repository.ts
├── repositories/                │   └── pay-invoice/
│   └── ...                      │       ├── handler.ts
└── models/                      │       └── repository.ts
```

**Why it matters:** Changing one feature touches one directory, not three horizontal layers. Features can be deleted cleanly. Teams can own slices independently.

**When to use for Tovu:** Tovu already applies vertical slices _within_ its bounded-context packages (e.g., inside `@tovu/content`, each operation is a self-contained slice). If the package structure ever flattens under pressure, this is the pattern to return to.

**When NOT to use:** When shared logic between features is substantial — slices can duplicate code without discipline.

---

