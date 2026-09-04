// Version identifiers that participate in the reproduction contract.
//
// spec + seed + rerolls + these versions = the same canonical sheet. Change any
// generation behaviour and GENERATOR_VERSION must move with it, or stored
// sheets will silently disagree with freshly generated ones.

export const GENERATOR_VERSION = '1.0.0';
export const SCHEMA_VERSION = 'sheet/1';
