export { LeBadge } from './components/folkr-badge/folkr-badge';
/* Registered from the barrel, so every fragment that imports the kit can put
   badges beside a name without importing anything extra. A component used only
   as a tag in JSX is never pulled in automatically — Stencil sees a string,
   not a reference — so leaving it out here renders it as an empty unknown
   element, silently and with no error anywhere. */
export { LeBadges } from './components/folkr-badges/folkr-badges';
export { LePostCard } from './components/folkr-post-card/folkr-post-card';
