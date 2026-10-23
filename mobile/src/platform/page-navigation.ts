/** One forward navigation per visit. The owner remains locked after arrival so
 * a delayed duplicate activation from its old controls cannot push another page.
 */
export function createPageNavigation<Page>(owner: Page, ports: {
  current(): Page | undefined;
  navigate(create: () => Page): void;
}) {
  let leaving = false;
  return {
    open(create: () => Page): boolean {
      if (leaving || ports.current() !== owner) return false;
      leaving = true;
      try { ports.navigate(create); return true; }
      catch (error) { leaving = false; throw error; }
    },
    returned(): void { leaving = false; },
  };
}
