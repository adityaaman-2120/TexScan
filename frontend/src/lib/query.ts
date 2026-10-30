import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError, errorMessage, isUnreachable } from "@/api/errors";

declare module "@tanstack/react-query" {
  interface Register {
    queryMeta: { silent?: boolean };
    mutationMeta: { silent?: boolean };
  }
}

/** One toast per distinct problem; an offline backend would otherwise toast once per query. */
function notify(error: unknown, id: string): void {
  const offline = isUnreachable(error);
  toast.error(offline ? "Backend unreachable" : "Request failed", {
    id: offline ? "offline" : id,
    description: errorMessage(error),
  });
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      if (!query.meta?.silent) notify(error, JSON.stringify(query.queryKey));
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      if (!mutation.meta?.silent) notify(error, `mutation-${mutation.mutationId}`);
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      refetchOnWindowFocus: false,
      // 4xx and network errors will not fix themselves on retry
      retry: (count, error) => !(error instanceof ApiError && (error.status === 0 || error.status < 500)) && count < 1,
    },
  },
});
