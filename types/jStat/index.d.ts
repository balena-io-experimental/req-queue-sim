declare module 'jStat' {
  // typing module default export as `any` will allow you to access its members without compiler warning
  var jStat: {
    lognormal: (mu: number, sigma: number) => { sample: () => number }
  }; 
  export jStat;
}
