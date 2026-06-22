# API Endpoints

Service Hub exposes a JSON HTTP API for shared collections, environments, folders, and saved requests. All routes except `GET /health` require a valid bearer token — see [Authentication](./auth.md).

## Overview

- **Base URL:** `http://127.0.0.1:8788` (default from `server.yaml`)
- **Content-Type:** `application/json` for request and response bodies
- **Protected routes:** `Authorization: Bearer hbk_...`

Example authenticated request:

```bash
curl -s http://127.0.0.1:8788/collections \
  -H "Authorization: Bearer hbk_your_token_here"
```

## Conventions

### Timestamps

Date fields in responses are ISO 8601 strings (for example `"2026-01-01T00:00:00.000Z"`).

### Errors

Failed requests return a JSON body:

```json
{ "error": "Human-readable message" }
```

| Status | When |
| ------ | ---- |
| `400` | Validation failure or missing required field |
| `401` | Missing, malformed, unknown, or revoked bearer token |
| `404` | Entity not found |

### Empty responses

Routes that return `204 No Content` send a `null` body.

### Shared types

These shapes appear in multiple request and response payloads.

**Variable** — collection or environment variable:

```json
{ "key": "baseUrl", "value": "https://api.example.com", "defaultValue": "", "share": false }
```

**KeyValue** — header or query parameter with enable toggle:

```json
{ "key": "Accept", "value": "application/json", "enabled": true }
```

**AuthConfig** — authorization on collections and saved requests:

```json
{
  "type": "none",
  "basic": { "username": "", "password": "" },
  "bearer": { "token": "" }
}
```

`type` is one of `none`, `basic`, or `bearer`.

**BodyType** — saved request body format: `none`, `json`, `text`, `multipart`, or `urlencoded`.

**HTTP methods** for saved requests: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`.

## Health

### GET /health

Public health check for load balancers and HarborClient connectivity probes. No authentication required.

**Response `200`:**

```json
{ "status": "ok", "version": "0.1.0" }
```

```bash
curl -s http://127.0.0.1:8788/health
```

## Collections

Collections are top-level workspaces that hold folders, saved requests, and collection-scoped defaults (variables, headers, scripts, auth).

**Collection record:**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Shared API",
  "variables": [],
  "headers": [],
  "auth": { "type": "none", "basic": { "username": "", "password": "" }, "bearer": { "token": "" } },
  "preRequestScript": "",
  "postRequestScript": "",
  "createdAt": "2026-01-01T00:00:00.000Z"
}
```

### GET /collections

Lists all collections ordered by name.

**Auth:** Bearer token required.

**Response `200`:**

```json
{ "collections": [ /* collection records */ ] }
```

```bash
curl -s http://127.0.0.1:8788/collections \
  -H "Authorization: Bearer hbk_your_token_here"
```

### POST /collections

Creates a new collection with the given display name.

**Auth:** Bearer token required.

**Request body:**

```json
{ "name": "Shared API" }
```

**Response `200`:** Collection record.

**Response `400`:** Validation error (for example empty name).

```bash
curl -s -X POST http://127.0.0.1:8788/collections \
  -H "Authorization: Bearer hbk_your_token_here" \
  -H "Content-Type: application/json" \
  -d '{"name":"Shared API"}'
```

### PUT /collections/:id

Updates a collection's name, variables, headers, scripts, and auth defaults.

**Auth:** Bearer token required.

**Request body:**

```json
{
  "name": "Shared API",
  "variables": [],
  "headers": [],
  "preRequestScript": "",
  "postRequestScript": "",
  "auth": { "type": "none", "basic": { "username": "", "password": "" }, "bearer": { "token": "" } }
}
```

**Response `200`:** Updated collection record.

**Response `400`:** Validation error.

**Response `404`:** Collection not found.

### DELETE /collections/:id

Deletes a collection and all nested folders and saved requests.

**Auth:** Bearer token required.

**Response `204`:** No content.

**Response `404`:** Collection not found.

## Environments

Environments hold named variable sets used across requests.

**Environment record:**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440001",
  "name": "Production",
  "variables": [],
  "createdAt": "2026-01-01T00:00:00.000Z"
}
```

### GET /environments

Lists all environments ordered by name.

**Auth:** Bearer token required.

**Response `200`:**

```json
{ "environments": [ /* environment records */ ] }
```

```bash
curl -s http://127.0.0.1:8788/environments \
  -H "Authorization: Bearer hbk_your_token_here"
```

### POST /environments

Creates a new environment with the given display name.

**Auth:** Bearer token required.

**Request body:**

```json
{ "name": "Production" }
```

**Response `200`:** Environment record.

**Response `400`:** Validation error.

```bash
curl -s -X POST http://127.0.0.1:8788/environments \
  -H "Authorization: Bearer hbk_your_token_here" \
  -H "Content-Type: application/json" \
  -d '{"name":"Production"}'
```

### PUT /environments/:id

Updates an environment's name and variables.

**Auth:** Bearer token required.

**Request body:**

```json
{
  "name": "Production",
  "variables": [{ "key": "baseUrl", "value": "https://api.example.com", "defaultValue": "", "share": false }]
}
```

**Response `200`:** Updated environment record.

**Response `400`:** Validation error.

**Response `404`:** Environment not found.

### DELETE /environments/:id

Deletes an environment by id.

**Auth:** Bearer token required.

**Response `204`:** No content.

**Response `404`:** Environment not found.

## Folders

Folders organize saved requests within a collection.

**Folder record:**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440002",
  "collectionId": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Users",
  "sortOrder": 0,
  "createdAt": "2026-01-01T00:00:00.000Z"
}
```

### GET /collections/:collectionId/folders

Lists folders in a collection ordered by sort order, then name.

**Auth:** Bearer token required.

**Response `200`:**

```json
{ "folders": [ /* folder records */ ] }
```

```bash
curl -s http://127.0.0.1:8788/collections/550e8400-e29b-41d4-a716-446655440000/folders \
  -H "Authorization: Bearer hbk_your_token_here"
```

### POST /collections/:collectionId/folders

Creates a folder in the given collection.

**Auth:** Bearer token required.

**Request body:**

```json
{ "name": "Users" }
```

**Response `200`:** Folder record.

**Response `400`:** Validation error.

```bash
curl -s -X POST http://127.0.0.1:8788/collections/550e8400-e29b-41d4-a716-446655440000/folders \
  -H "Authorization: Bearer hbk_your_token_here" \
  -H "Content-Type: application/json" \
  -d '{"name":"Users"}'
```

### PATCH /folders/:id

Renames a folder by id.

**Auth:** Bearer token required.

**Request body:**

```json
{ "name": "User Management" }
```

**Response `200`:** Updated folder record.

**Response `400`:** Validation error.

**Response `404`:** Folder not found.

### DELETE /folders/:id

Deletes a folder and all saved requests inside it.

**Auth:** Bearer token required.

**Response `204`:** No content.

**Response `404`:** Folder not found.

### PUT /collections/:collectionId/folders/reorder

Reorders folders within a collection.

**Auth:** Bearer token required.

**Request body:**

```json
{
  "orderedFolderIds": [
    "550e8400-e29b-41d4-a716-446655440002",
    "550e8400-e29b-41d4-a716-446655440003"
  ]
}
```

**Response `204`:** No content.

**Response `404`:** Collection or folder not found.

## Requests

Saved requests store HTTP method, URL, headers, params, body, scripts, and optional folder placement.

**Saved request record:**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440004",
  "collectionId": "550e8400-e29b-41d4-a716-446655440000",
  "name": "List users",
  "method": "GET",
  "url": "https://api.example.com/users",
  "headers": [],
  "params": [],
  "auth": { "type": "none", "basic": { "username": "", "password": "" }, "bearer": { "token": "" } },
  "body": "",
  "bodyType": "none",
  "preRequestScript": "",
  "postRequestScript": "",
  "comment": "",
  "folderId": null,
  "sortOrder": 0,
  "createdAt": "2026-01-01T00:00:00.000Z",
  "updatedAt": "2026-01-01T00:00:00.000Z"
}
```

`folderId` is `null` when the request lives at the collection root.

### GET /collections/:collectionId/requests

Lists saved requests in a collection.

**Auth:** Bearer token required.

**Response `200`:**

```json
{ "requests": [ /* saved request records */ ] }
```

```bash
curl -s http://127.0.0.1:8788/collections/550e8400-e29b-41d4-a716-446655440000/requests \
  -H "Authorization: Bearer hbk_your_token_here"
```

### POST /collections/:collectionId/requests

Creates a new saved request in a collection.

**Auth:** Bearer token required.

**Request body:**

```json
{
  "name": "List users",
  "method": "GET",
  "url": "https://api.example.com/users",
  "headers": [],
  "params": [],
  "auth": { "type": "none", "basic": { "username": "", "password": "" }, "bearer": { "token": "" } },
  "body": "",
  "bodyType": "none",
  "preRequestScript": "",
  "postRequestScript": "",
  "comment": "",
  "folderId": null
}
```

`folderId` is optional; omit it or set `null` for the collection root.

**Response `200`:** Saved request record.

**Response `400`:** Validation error.

**Response `404`:** Collection or folder not found.

```bash
curl -s -X POST http://127.0.0.1:8788/collections/550e8400-e29b-41d4-a716-446655440000/requests \
  -H "Authorization: Bearer hbk_your_token_here" \
  -H "Content-Type: application/json" \
  -d '{"name":"List users","method":"GET","url":"https://api.example.com/users","headers":[],"params":[],"auth":{"type":"none","basic":{"username":"","password":""},"bearer":{"token":""}},"body":"","bodyType":"none","preRequestScript":"","postRequestScript":"","comment":""}'
```

### PUT /requests/:id

Updates an existing saved request by id.

**Auth:** Bearer token required.

**Request body:** Same fields as `POST`, plus required `collectionId`:

```json
{
  "collectionId": "550e8400-e29b-41d4-a716-446655440000",
  "name": "List users",
  "method": "GET",
  "url": "https://api.example.com/users",
  "headers": [],
  "params": [],
  "auth": { "type": "none", "basic": { "username": "", "password": "" }, "bearer": { "token": "" } },
  "body": "",
  "bodyType": "none",
  "preRequestScript": "",
  "postRequestScript": "",
  "comment": "",
  "folderId": null
}
```

**Response `200`:** Updated saved request record.

**Response `400`:** Validation error.

**Response `404`:** Request, collection, or folder not found.

### DELETE /requests/:id

Deletes a saved request by id.

**Auth:** Bearer token required.

**Response `204`:** No content.

**Response `404`:** Request not found.

### PUT /collections/:collectionId/requests/reorder

Reorders saved requests within a folder or the collection root.

**Auth:** Bearer token required.

**Request body:**

```json
{
  "folderId": null,
  "orderedRequestIds": [
    "550e8400-e29b-41d4-a716-446655440004",
    "550e8400-e29b-41d4-a716-446655440005"
  ]
}
```

Set `folderId` to `null` to reorder requests at the collection root.

**Response `204`:** No content.

**Response `404`:** Collection, folder, or request not found.

### PUT /requests/:id/move

Moves a single saved request to another folder or a specific index at the collection root.

**Auth:** Bearer token required.

**Request body:**

```json
{
  "folderId": "550e8400-e29b-41d4-a716-446655440002",
  "index": 0
}
```

Set `folderId` to `null` to move the request to the collection root at `index`.

**Response `204`:** No content.

**Response `404`:** Request or folder not found.
