export function createToast(deps?: {
  root?: Document | ParentNode;
  durationMs?: number;
}): (message: string, isError?: boolean) => void;
