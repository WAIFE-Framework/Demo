export interface Page { el: HTMLElement; update: () => void; }
export type PageFactory = () => Page;
