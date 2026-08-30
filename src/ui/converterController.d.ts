export function createConverterController(deps: {
  convertService: unknown;
  showToast: (message: string, isError?: boolean) => void;
  root?: ParentNode | Document;
}): {
  bind(): void;
  loadToday(): Promise<{ hy?: number } | null>;
};
