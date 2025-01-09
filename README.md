# GitDAI

## Environment Variables

The following environment variables are required for the application to function:

```bash
VITE_OPENAI_API_KEY=your-openai-api-key-here
VITE_RAILWAY_PROJECT_ID=your-railway-project-id
VITE_RAILWAY_ENVIRONMENT_ID=your-railway-environment-id
VITE_RAILWAY_SERVICE_ID=your-railway-service-id
VITE_RAILWAY_API_TOKEN=your-railway-api-token
```

### Important Notes:

1. These variables must be set in your deployment environment (e.g., Netlify)
2. Do not use a `.env` file in production
3. For local development, you can use the `.env.example` file as a template
4. Never commit sensitive values to version control
