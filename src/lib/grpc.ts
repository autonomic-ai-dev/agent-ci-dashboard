import { createPromiseClient, type PromiseClient } from '@connectrpc/connect';
import { createGrpcWebTransport } from '@connectrpc/connect-web';
import { InsightsService } from './gen/insights/v1/insights_service_connect';

export type InsightsClient = PromiseClient<typeof InsightsService>;

let client: InsightsClient | null = null;

const GRPC_BASE_URL = import.meta.env.VITE_GRPC_API_URL || 'http://localhost:3002';

export function getInsightsClient(token: string): InsightsClient {
  const transport = createGrpcWebTransport({
    baseUrl: GRPC_BASE_URL,
    fetch: (input, init) => {
      const headers = new Headers(init?.headers);
      headers.set('Authorization', `Bearer ${token}`);
      return fetch(input, { ...init, headers });
    },
  });

  client = createPromiseClient(InsightsService, transport);
  return client;
}
