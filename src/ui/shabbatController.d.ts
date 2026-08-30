export function createShabbatController(deps: {
  shabbatService: unknown;
  showToast: (message: string, isError?: boolean) => void;
  root?: ParentNode | Document;
}): {
  bind(): void;
};
