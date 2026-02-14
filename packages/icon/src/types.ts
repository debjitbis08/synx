export type HTMLAttributes<K extends string> = {
  [key: string]: unknown;
  class?: string;
  className?: string;
  style?: string | Record<string, string | number>;
};

export type IconBody = {
  body: string;
  width?: number;
  height?: number;
  left?: number;
  top?: number;
};

export type IconCollection = Record<string, IconBody>;

export type IconCollectionLoader = () => Promise<IconCollection>;

export type IconName = `${string}:${string}`;

export type IconifyCollectionJSON = {
  prefix?: string;
  icons: Record<string, IconBody>;
};
