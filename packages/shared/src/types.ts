export type ID = number | string;

export type ThermosRule = {
  context: "INSIDE" | "OUTSIDE";
  cupsPerFlask: number;
};
