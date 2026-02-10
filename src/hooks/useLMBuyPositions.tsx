"use client";
import {
  GetPurchasePositionDocument,
  GetPurchasePositionsDocument,
} from "../graphql/clamm/gql/graphql";
import { useMarketStore } from "../zustand/useMarketStore";
import useTokenPricesStore from "../zustand/useTokenPricesStore";
import { useQuery } from "@tanstack/react-query";
import request from "graphql-request";
import { useCallback, useMemo } from "react";
import { formatUnits } from "viem";

export type BuyPositions = {
  tokenId: number;
  size: string;
  sizeUsdValue: number;
  strike: number;
  strikeUsd: number;
  type: "call" | "put";
  breakeven: number;
  callToken: {
    symbol: string;
    decimals: number;
  };
  putToken: {
    symbol: string;
    decimals: number;
  };
  market: string;
};

type Props = {
  pagination: {
    first: number;
    skip: number;
  };
  account: string;
};

export const getBuyPosition = async (
  currentMarket: any,
  account: string,
  positionId: number,
  prices: any,
  markPrice: any
) => {
  try {
    if (!currentMarket || !account) return [];
    const url: string | undefined = process.env.REACT_APP_CLAMM_SUBGRAPH_42161;

    if (!url) return [];

    const { callToken, putToken, token0, token1, inversePrice } = currentMarket;

    const positions = [];

    const { options } = await request(url, GetPurchasePositionDocument, {
      tokenId: Number(positionId),
    });

    for (const {
      isCall,
      tickLower,
      tickUpper,
      size,
      premium,
      tokenId,
    } of options) {
      const tick = isCall ? tickUpper : tickLower;
      const decimals = isCall ? callToken.decimals : putToken.decimals;

      const putTokenPrice = prices[currentMarket?.putToken.symbol as string];
      const strike = getPriceFromTick(
        tick,
        10 ** token0.decimals,
        10 ** token1.decimals,
        inversePrice
      );

      const strikeUsd = strike * putTokenPrice;

      const sizeReadable = Number(formatUnits(BigInt(size), decimals));

      const sizeUsdValue =
        (isCall ? sizeReadable * markPrice : sizeReadable) * putTokenPrice;

      const premiumReadable = Number(formatUnits(BigInt(premium), decimals));
      const premiumInQuoteAsset = isCall
        ? premiumReadable * markPrice
        : premiumReadable;
      const premiumUsdValue = premiumInQuoteAsset * putTokenPrice;

      const optionsAmount = !isCall
        ? Number(sizeUsdValue) / (strike * putTokenPrice)
        : sizeReadable;

      const breakeven = !isCall
        ? Number(strike * putTokenPrice) - premiumUsdValue / optionsAmount
        : Number(strike * putTokenPrice) + premiumUsdValue / optionsAmount;

      positions.push({
        tokenId: Number(tokenId),
        sizeUsdValue,
        size: size,
        strike,
        type: isCall ? "call" : "put",
        callToken: currentMarket.callToken,
        putToken: currentMarket.putToken,
        breakeven,
        strikeUsd,
      });
    }

    return positions[0];
  } catch (err) {
    console.log(err, "err");
    return [];
  }
};

export const getPriceFromTick = (
  tick: number,
  precision0: number,
  precision1: number,
  inversePrice: boolean
) => {
  const base = inversePrice ? 1 / 1.0001 ** tick : 1.0001 ** tick;
  const dividend = inversePrice ? precision0 : precision1;
  const mulitplicant = inversePrice ? precision1 : precision0;
  const price = (base * mulitplicant) / dividend;
  return price;
};

const useBuyPositions = ({ pagination: { first, skip }, account }: Props) => {
  const { data: currentMarket, slot0 } = useMarketStore();
  const { prices } = useTokenPricesStore();

  const markPrice = useMemo(() => {
    if (!currentMarket) return 0;
    return getPriceFromTick(
      slot0.tick,
      10 ** currentMarket.token0.decimals,
      10 ** currentMarket.token1.decimals,
      currentMarket.inversePrice
    );
  }, [currentMarket, slot0.tick]);

  const getBuyPositions = useCallback(async () => {
    try {
      if (!currentMarket || !account) return [];
      const url: string | undefined =
        process.env.REACT_APP_CLAMM_SUBGRAPH_42161;

      if (!url) return [];

      const { callToken, putToken, token0, token1, inversePrice } =
        currentMarket;

      const positions = [];

      const { options } = await request(url, GetPurchasePositionsDocument, {
        currentTimestamp: Math.round(new Date().getTime() / 1000),
        optionMarket: currentMarket.address.toLowerCase(),
        user: account.toLowerCase(),
        first,
        skip,
      });

      for (const {
        isCall,
        tickLower,
        tickUpper,
        size,
        premium,
        tokenId,
      } of options) {
        const tick = isCall ? tickUpper : tickLower;
        const decimals = isCall ? callToken.decimals : putToken.decimals;

        const putTokenPrice = prices[currentMarket?.putToken.symbol as string];
        const strike = getPriceFromTick(
          tick,
          10 ** token0.decimals,
          10 ** token1.decimals,
          inversePrice
        );

        const strikeUsd = strike * putTokenPrice;

        const sizeReadable = Number(formatUnits(BigInt(size), decimals));

        const sizeUsdValue =
          (isCall ? sizeReadable * markPrice : sizeReadable) * putTokenPrice;

        const premiumReadable = Number(formatUnits(BigInt(premium), decimals));
        const premiumInQuoteAsset = isCall
          ? premiumReadable * markPrice
          : premiumReadable;
        const premiumUsdValue = premiumInQuoteAsset * putTokenPrice;

        const optionsAmount = !isCall
          ? Number(sizeUsdValue) / (strike * putTokenPrice)
          : sizeReadable;

        const breakeven = !isCall
          ? Number(strike * putTokenPrice) - premiumUsdValue / optionsAmount
          : Number(strike * putTokenPrice) + premiumUsdValue / optionsAmount;

        positions.push({
          tokenId: Number(tokenId),
          sizeUsdValue,
          size: size,
          strike,
          type: isCall ? "call" : "put",
          callToken: currentMarket.callToken,
          putToken: currentMarket.putToken,
          breakeven,
          strikeUsd,
        });
      }

      return positions;
    } catch (err) {
      console.log(err, "err");
      return [];
    }
  }, [currentMarket, first, skip, account, prices, markPrice]);

  const {
    data = [],
    refetch,
    isLoading,
  } = useQuery({
    queryKey: [getBuyPositions],
    queryFn: getBuyPositions,
  });

  return {
    positions: data,
    refetch,
    isLoading,
  };
};

export default useBuyPositions;
