declare module 'react-window' {
  import * as React from 'react';

  export interface ListChildComponentProps<T = unknown> {
    data: T;
    index: number;
    style: React.CSSProperties;
  }

  export interface FixedSizeListProps<T = unknown> {
    height: number;
    itemCount: number;
    itemSize: number;
    width?: number | string;
    itemData?: T;
    children: React.ComponentType<ListChildComponentProps<T>>;
  }

  export const FixedSizeList: <T = unknown>(
    props: FixedSizeListProps<T>
  ) => JSX.Element;
}
