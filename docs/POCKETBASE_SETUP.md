# PocketBase Collections Setup Guide

A comprehensive guide for programmatically setting up PocketBase collections via the Admin API.

## Table of Contents

- [Overview](#overview)
- [Authentication](#authentication)
- [Creating Collections](#creating-collections)
- [Field Types Reference](#field-types-reference)
- [API Rules](#api-rules)
- [Complete Example Script](#complete-example-script)
- [Troubleshooting](#troubleshooting)

---

## Overview

PocketBase v0.23+ uses a REST API to manage collections. Key points:

- Collections use the `fields` array (not `schema` - that's the old format)
- Field options go directly on the field object, not in a nested `options` object
- API rules are validated against existing fields, so create collections before applying complex rules
- The built-in `users` auth collection has ID `_pb_users_auth_`

---

## Authentication

### PocketBase v0.23+ (Superusers)

```javascript
const response = await fetch('http://localhost:8090/api/collections/_superusers/auth-with-password', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ identity: email, password }),
});
const { token } = await response.json();
```

### Older Versions (Admins)

```javascript
const response = await fetch('http://localhost:8090/api/admins/auth-with-password', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ identity: email, password }),
});
const { token } = await response.json();
```

### Using the Token

```javascript
const headers = {
  'Content-Type': 'application/json',
  'Authorization': token,  // No "Bearer " prefix needed
};
```

---

## Creating Collections

### Basic Structure

```javascript
const collection = {
  name: 'posts',           // Collection name (lowercase, no spaces)
  type: 'base',            // 'base', 'auth', or 'view'
  fields: [...],           // Array of field definitions
  listRule: '',            // API rule for listing records
  viewRule: '',            // API rule for viewing a single record
  createRule: '',          // API rule for creating records
  updateRule: '',          // API rule for updating records
  deleteRule: '',          // API rule for deleting records
};
```

### Collection Types

| Type | Description |
|------|-------------|
| `base` | Standard collection for any data |
| `auth` | User authentication collection with built-in email/password fields |
| `view` | Read-only collection based on SQL SELECT query |

### Create via API

```javascript
const response = await fetch('http://localhost:8090/api/collections', {
  method: 'POST',
  headers,
  body: JSON.stringify(collection),
});
const created = await response.json();
console.log('Created with ID:', created.id);
```

### Update via API

```javascript
const response = await fetch(`http://localhost:8090/api/collections/${collectionId}`, {
  method: 'PATCH',
  headers,
  body: JSON.stringify({ listRule: '@request.auth.id != ""' }),
});
```

### Delete via API

```javascript
await fetch(`http://localhost:8090/api/collections/${name}`, {
  method: 'DELETE',
  headers,
});
```

---

## Field Types Reference

### Text Field

```javascript
{
  name: 'title',
  type: 'text',
  required: true,
  min: 1,           // Minimum length
  max: 200,         // Maximum length
  pattern: '',      // Regex pattern (optional)
}
```

### Number Field

```javascript
{
  name: 'price',
  type: 'number',
  required: true,
  min: 0,           // Minimum value
  max: 10000,       // Maximum value
  onlyInt: true,    // Integer only (no decimals)
}
```

### Boolean Field

```javascript
{
  name: 'is_active',
  type: 'bool',
  required: false,
}
```

### Email Field

```javascript
{
  name: 'email',
  type: 'email',
  required: true,
}
```

### URL Field

```javascript
{
  name: 'website',
  type: 'url',
  required: false,
}
```

### Date Field

```javascript
{
  name: 'published_at',
  type: 'date',
  required: false,
  min: '',          // Minimum date (ISO format)
  max: '',          // Maximum date (ISO format)
}
```

### Select Field (Single)

```javascript
{
  name: 'status',
  type: 'select',
  required: true,
  maxSelect: 1,
  values: ['draft', 'published', 'archived'],
}
```

### Select Field (Multiple)

```javascript
{
  name: 'tags',
  type: 'select',
  required: false,
  maxSelect: 5,     // Max selections allowed
  values: ['tech', 'news', 'tutorial', 'review'],
}
```

### Relation Field (Single)

```javascript
{
  name: 'author',
  type: 'relation',
  required: true,
  collectionId: '_pb_users_auth_',  // Target collection ID
  maxSelect: 1,
  cascadeDelete: false,             // Delete this record when related record is deleted
}
```

### Relation Field (Multiple)

```javascript
{
  name: 'categories',
  type: 'relation',
  required: false,
  collectionId: 'categories_collection_id',
  maxSelect: 10,    // Max relations allowed
  cascadeDelete: false,
}
```

### JSON Field

```javascript
{
  name: 'metadata',
  type: 'json',
  required: false,
  maxSize: 2000000, // Max size in bytes
}
```

### File Field

```javascript
{
  name: 'avatar',
  type: 'file',
  required: false,
  maxSelect: 1,     // Max files
  maxSize: 5242880, // Max size per file (bytes)
  mimeTypes: ['image/jpeg', 'image/png', 'image/gif'],
}
```

### Editor Field (Rich Text)

```javascript
{
  name: 'content',
  type: 'editor',
  required: false,
  maxSize: 50000,
}
```

---

## API Rules

### Rule Values

| Value | Meaning |
|-------|---------|
| `null` | Locked - Only superusers can access |
| `""` (empty string) | Public - Anyone can access |
| `"@request.auth.id != \"\""` | Authenticated - Any logged-in user |
| `"@request.auth.id != \"\" && user = @request.auth.id"` | Owner only |

### Common Patterns

#### Public Read, Auth Write

```javascript
{
  listRule: '',                          // Anyone can list
  viewRule: '',                          // Anyone can view
  createRule: '@request.auth.id != ""',  // Must be logged in to create
  updateRule: '@request.auth.id != "" && user = @request.auth.id',
  deleteRule: '@request.auth.id != "" && user = @request.auth.id',
}
```

#### Private (Owner Only)

```javascript
{
  listRule: '@request.auth.id != "" && user = @request.auth.id',
  viewRule: '@request.auth.id != "" && user = @request.auth.id',
  createRule: '@request.auth.id != ""',
  updateRule: '@request.auth.id != "" && user = @request.auth.id',
  deleteRule: '@request.auth.id != "" && user = @request.auth.id',
}
```

#### Nested Relation Check

```javascript
// Check ownership through a related collection
{
  listRule: '@request.auth.id != "" && post.author = @request.auth.id',
}
```

### Request Fields Available in Rules

| Field | Description |
|-------|-------------|
| `@request.auth.id` | Current user's ID (empty if not authenticated) |
| `@request.auth.*` | Any field from the authenticated user's record |
| `@request.body.*` | Submitted form data |
| `@request.query.*` | URL query parameters |
| `@request.headers.*` | Request headers (lowercase keys) |

---

## Complete Example Script

```javascript
/**
 * PocketBase Setup Script Template
 * 
 * Usage: node setup.js <admin_email> <admin_password>
 */

const POCKETBASE_URL = process.env.POCKETBASE_URL || 'http://localhost:8090';

async function main() {
  const [,, email, password] = process.argv;
  
  if (!email || !password) {
    console.error('Usage: node setup.js <admin_email> <admin_password>');
    process.exit(1);
  }

  // Authenticate (try v0.23+ first, then fallback)
  let authResponse = await fetch(`${POCKETBASE_URL}/api/collections/_superusers/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: email, password }),
  });

  if (!authResponse.ok) {
    authResponse = await fetch(`${POCKETBASE_URL}/api/admins/auth-with-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identity: email, password }),
    });
  }

  if (!authResponse.ok) {
    console.error('Authentication failed');
    process.exit(1);
  }

  const { token } = await authResponse.json();
  const headers = { 'Content-Type': 'application/json', 'Authorization': token };

  // Helper function
  async function createCollection(data) {
    console.log(`Creating: ${data.name}...`);
    const response = await fetch(`${POCKETBASE_URL}/api/collections`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    });
    
    if (!response.ok) {
      const error = await response.text();
      if (error.includes('already exists')) {
        console.log(`  ${data.name} already exists, fetching...`);
        const getResponse = await fetch(`${POCKETBASE_URL}/api/collections/${data.name}`, { headers });
        return await getResponse.json();
      }
      throw new Error(`Failed: ${error}`);
    }
    
    const collection = await response.json();
    console.log(`  Created ${data.name} (ID: ${collection.id})`);
    return collection;
  }

  // Get users collection ID
  const usersResponse = await fetch(`${POCKETBASE_URL}/api/collections/users`, { headers });
  const usersCollection = await usersResponse.json();
  const usersId = usersCollection.id;

  // Create your collections
  const posts = await createCollection({
    name: 'posts',
    type: 'base',
    fields: [
      { name: 'author', type: 'relation', required: true, collectionId: usersId, maxSelect: 1 },
      { name: 'title', type: 'text', required: true, min: 1, max: 200 },
      { name: 'content', type: 'editor', required: true },
      { name: 'status', type: 'select', required: true, maxSelect: 1, values: ['draft', 'published'] },
    ],
    listRule: '',  // Public listing
    viewRule: '',  // Public viewing
    createRule: '@request.auth.id != ""',
    updateRule: '@request.auth.id != "" && author = @request.auth.id',
    deleteRule: '@request.auth.id != "" && author = @request.auth.id',
  });

  const comments = await createCollection({
    name: 'comments',
    type: 'base',
    fields: [
      { name: 'post', type: 'relation', required: true, collectionId: posts.id, maxSelect: 1, cascadeDelete: true },
      { name: 'author', type: 'relation', required: true, collectionId: usersId, maxSelect: 1 },
      { name: 'content', type: 'text', required: true, min: 1, max: 1000 },
    ],
    listRule: '',
    viewRule: '',
    createRule: '@request.auth.id != ""',
    updateRule: '@request.auth.id != "" && author = @request.auth.id',
    deleteRule: '@request.auth.id != "" && author = @request.auth.id',
  });

  console.log('\n✅ Setup complete!');
}

main().catch(console.error);
```

---

## Troubleshooting

### "Invalid rule" Error

**Cause:** Rule references a field that doesn't exist.

**Solution:** Make sure the field name in your rule matches exactly. For relations, use dot notation: `campaign.user`, not `campaign_user`.

### "schema" vs "fields"

**Cause:** Old tutorials use `schema`, but PocketBase v0.23+ uses `fields`.

**Wrong (old format):**
```javascript
{
  schema: [
    { name: 'title', type: 'text', options: { min: 1, max: 200 } }
  ]
}
```

**Correct (new format):**
```javascript
{
  fields: [
    { name: 'title', type: 'text', min: 1, max: 200 }
  ]
}
```

### Collection Not Found

**Cause:** Collection name is case-sensitive.

**Solution:** Always use lowercase collection names without spaces.

### Relation Field Not Working

**Cause:** Using collection name instead of collection ID.

**Wrong:**
```javascript
{ name: 'author', type: 'relation', collectionId: 'users' }
```

**Correct:**
```javascript
{ name: 'author', type: 'relation', collectionId: '_pb_users_auth_' }
// Or fetch the ID dynamically:
const users = await fetch(`${POCKETBASE_URL}/api/collections/users`, { headers });
const { id } = await users.json();
{ name: 'author', type: 'relation', collectionId: id }
```

### Reset Everything

Delete the `pb_data/` folder in your PocketBase directory and restart. This removes all data and collections.

---

## Additional Resources

- [PocketBase Docs](https://pocketbase.io/docs/)
- [API Rules Reference](https://pocketbase.io/docs/api-rules-and-filters/)
- [Collections Reference](https://pocketbase.io/docs/collections/)
- [Working with Relations](https://pocketbase.io/docs/working-with-relations/)
