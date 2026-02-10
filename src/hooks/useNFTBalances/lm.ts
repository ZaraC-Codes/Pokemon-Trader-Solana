// ZeroAddress constant (equivalent to ethers ZeroAddress)
const ZeroAddress = '0x0000000000000000000000000000000000000000';
import { currentMarket } from "../../config/nft/lm";
import {
  GetAllPurchasePositionsDocument,
  GetPurchasePositionDocument,
  GetPurchasePositionsDocument,
} from "../../graphql/clamm/gql/graphql";
import request from "graphql-request";

export const getLmPositionData = async (
  ids: number[],
  account?: string
): Promise<any[]> => {
  const url: string = process.env.REACT_APP_CLAMM_SUBGRAPH_42161!;
  if (account) {
    if (account === ZeroAddress) {
      const { options } = await request(url, GetAllPurchasePositionsDocument, {
        currentTimestamp: Math.round(new Date().getTime() / 1000),
        optionMarket: currentMarket.address.toLowerCase(),
        first: 1000,
        skip: 0,
      });
      return options;
    }
    const { options } = await request(url, GetPurchasePositionsDocument, {
      currentTimestamp: Math.round(new Date().getTime() / 1000),
      optionMarket: currentMarket.address.toLowerCase(),
      user: account?.toLowerCase(),
      first: 1000,
      skip: 0,
    });

    return options;
  } else {
    const { options } = await request(url, GetPurchasePositionDocument, {
      tokenId: ids[0],
    });

    return options;
  }
};
