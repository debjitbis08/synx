export type {
  HTMLAttributes,
  IconBody,
  IconCollection,
  IconCollectionLoader,
  IconifyCollectionJSON,
  IconName,
} from "./types";

export {
  parseIconName,
  defineIconCollection,
  defineIconifyCollection,
  defineIconLoader,
  hasIcon,
  resolveIcon,
  loadIconCollection,
  resolveIconAsync,
  iconViewBox,
} from "./registry";
