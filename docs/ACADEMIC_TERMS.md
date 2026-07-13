# Academic Terms

Academic Terms represent term, semester, or quarter periods inside one Academic Year.

## API

- `GET /api/v1/academic/terms`
- `GET /api/v1/academic/terms?academicYearId=<id>`
- `POST /api/v1/academic/terms`
- `PUT /api/v1/academic/terms/:id`
- `DELETE /api/v1/academic/terms/:id`
- `POST /api/v1/academic/terms/:id/activate`
- `POST /api/v1/academic/terms/:id/archive`

Legacy `/api/academic/terms` routes are still mounted for backward compatibility.

## Controls

- Authentication: `protect`
- Plan gate: `academic-years`
- Read permission: `settings.view`
- Write permission: `settings.manage`
- Audit module: `ACADEMIC_MANAGEMENT`

## Tenant Rules

- Every term is scoped by `tenant`.
- Branch users can only use terms for their branch or global academic years.
- Soft-deleted terms are excluded from list, update, activation, archive, and delete operations.

## Validation Rules

- `academicYear` and route params must be valid Mongo ObjectIds.
- `name` is required and must be 2 to 80 characters.
- `code` is optional and limited to 20 characters.
- `startDate` and `endDate` must be valid dates.
- `endDate` must be on or after `startDate`.
- Term dates must fit inside the selected academic year.
- `order` must be a whole number from 1 to 12.
- Duplicate active name/code combinations are blocked per tenant, branch, and academic year.

## Test

Run focused validation coverage:

```bash
npm run test:academic-terms
```
