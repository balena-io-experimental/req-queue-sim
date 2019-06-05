export const tail = (arr, k) => arr.slice(Math.max(arr.length - k, 1));

export const last = arr => arr[arr.length - 1];

export const sum = arr => arr.reduce((a, x) => a + x);

export const mult = (a, b) => a.map((x, i) => x * b[i]);

export const mean = arr => sum(arr) / arr.length;

export const min = (a, b) => Math.min(a, b);

export const max = (a, b) => Math.max(a, b);
