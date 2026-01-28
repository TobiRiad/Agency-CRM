# Agency CRM

A full-featured email campaign management CRM built with Next.js, PocketBase, and Resend.

## Features

- **Multi-user Authentication**: Secure login and registration via PocketBase
- **Campaign Management**: Create and manage multiple email campaigns
- **Lead Management**: Track companies and contacts with custom fields
- **CSV Import**: Import leads with intelligent column mapping
- **Email Templates**: Create templates with A/B testing support
- **Email Sending**: Send emails via Resend API with tracking
- **Analytics Dashboard**: Track opens, clicks, bounces, and more
- **Funnel Stages**: Visual pipeline management for leads

## Tech Stack

- **Frontend/Backend**: Next.js 14 (App Router)
- **Database & Auth**: PocketBase (self-hosted)
- **Email Service**: Resend
- **UI Components**: shadcn/ui + Tailwind CSS
- **Charts**: Recharts

## Getting Started

### Prerequisites

- Node.js 18+
- PocketBase (download from [pocketbase.io](https://pocketbase.io/docs/))

### 1. Clone and Install

```bash
cd crm
npm install
```

### 2. Start PocketBase

```bash
cd pocketbase
./pocketbase serve   # Linux/Mac
.\pocketbase.exe serve   # Windows
```

PocketBase will be available at `http://localhost:8090`.

### 3. Set Up PocketBase

1. Open `http://localhost:8090/_/` in your browser
2. Create an admin/superuser account
3. Run the setup script to create all collections:

```bash
node scripts/setup-pocketbase.js <admin_email> <admin_password>
```

For detailed setup instructions, see [docs/POCKETBASE_SETUP.md](docs/POCKETBASE_SETUP.md).

### 4. Configure Environment

Copy the example environment file and update with your values:

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```
NEXT_PUBLIC_POCKETBASE_URL=http://localhost:8090
RESEND_API_KEY=re_your_api_key
RESEND_WEBHOOK_SECRET=whsec_your_webhook_secret
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 5. Start Development Server

```bash
npm run dev
```

Open `http://localhost:3000` in your browser.

## PocketBase Collections

The CRM uses the following 12 collections:

- `users` - User accounts (built-in auth collection)
- `campaigns` - Email campaigns
- `companies` - Target companies/agencies
- `contacts` - Individual contacts
- `custom_fields` - Dynamic field definitions per campaign
- `contact_field_values` - Field values for contacts
- `email_template_groups` - Template groups for A/B testing
- `email_templates` - Individual email templates
- `email_sends` - Email send records with tracking
- `funnel_stages` - Pipeline stages per campaign
- `contact_stages` - Contact stage assignments
- `follow_up_sequences` - Automated follow-up sequences
- `follow_up_steps` - Steps within follow-up sequences

## Resend Webhook Setup

To track email events (opens, clicks, bounces):

1. Go to your Resend dashboard
2. Navigate to Webhooks
3. Create a webhook pointing to: `https://your-domain.com/api/webhooks/resend`
4. Select events: `email.delivered`, `email.opened`, `email.clicked`, `email.bounced`
5. Copy the signing secret to your `.env.local`

## Project Structure

```
src/
├── app/
│   ├── (auth)/          # Auth pages (login, register)
│   ├── (dashboard)/     # Protected dashboard pages
│   │   └── campaigns/   # Campaign management
│   ├── api/             # API routes
│   └── layout.tsx       # Root layout
├── components/
│   ├── ui/              # Base UI components
│   ├── campaigns/       # Campaign components
│   ├── contacts/        # Contact components
│   ├── templates/       # Template components
│   └── dashboard/       # Dashboard components
├── lib/
│   ├── pocketbase.ts    # PocketBase client & functions
│   ├── resend.ts        # Resend email functions
│   └── utils.ts         # Utility functions
└── types/
    └── index.ts         # TypeScript types
```

## License

MIT
