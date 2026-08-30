export function createRemembrancesController(deps: {
  remembranceService: unknown;
  showToast: (message: string, isError?: boolean) => void;
  root?: ParentNode | Document;
}): {
  bind(): void;
  render(): void;
  refreshUpcoming(hebrewYear?: number): Promise<void>;
};
