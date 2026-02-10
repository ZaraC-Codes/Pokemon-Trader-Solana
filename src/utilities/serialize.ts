// Serialize NFT attributes
export function serializeNFTAttributes(attributes: Array<{ trait_type: string; value: string | number }>): any {
  const result: any = {};
  attributes.forEach((attr) => {
    result[attr.trait_type] = attr.value;
  });
  return result;
}
