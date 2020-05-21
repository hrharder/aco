import { BigNumber, NULL_BYTES } from '@0x/utils';
import { Web3Wrapper } from '@0x/web3-wrapper';
import React from 'react';
import { connect } from 'react-redux';
import styled from 'styled-components';

import { ZERO } from '../../../common/constants';
import { fetchTakerAndMakerFee } from '../../../store/relayer/actions';
import { getOpenBuyOrders, getOpenSellOrders, getEthAccount } from '../../../store/selectors';
import { getKnownTokens } from '../../../util/known_tokens';
import { buildMarketOrders, sumTakerAssetFillableOrders } from '../../../util/orders';
import { tokenAmountInUnits, tokenSymbolToDisplayString } from '../../../util/tokens';
import { CurrencyPair, OrderFeeData, OrderSide, OrderType, StoreState, UIOrder } from '../../../util/types';
import { getExpirationTimeOrdersFromConfig } from '../../../util/time_utils';

const Row = styled.div`
    align-items: center;
    display: flex;
    justify-content: space-between;
    padding-bottom: 12px;
    position: relative;
    z-index: 1;

    &:last-of-type {
        margin-bottom: 20px;
    }
`;

const Value = styled.div`
    color: ${props => props.theme.componentsTheme.textColorCommon};
    flex-shrink: 0;
    font-feature-settings: 'tnum' 1;
    font-size: 12px;
    white-space: nowrap;
`;

const CostValue = styled(Value)`
    font-feature-settings: 'tnum' 1;
    font-weight: bold;
`;

const Label = styled.label<{ color?: string }>`
    color: ${props => props.color || props.theme.componentsTheme.textColorCommon};
    font-size: 12px;
    font-weight: normal;
    font-stretch: normal;
    font-style: normal;
    letter-spacing: 0.6px;
    color: #ffffff;
    margin: 0;
`;

const FeeLabel = styled(Label)``;

const CostLabel = styled(Label)``;

interface OwnProps {
    orderType: OrderType;
    tokenAmount: BigNumber;
    tokenPrice: BigNumber;
    orderSide: OrderSide;
    currencyPair: CurrencyPair;
}

interface StateProps {
    openSellOrders: UIOrder[];
    openBuyOrders: UIOrder[];
    ethAccount: string;
}

interface DispatchProps {
    onFetchTakerAndMakerFee: (amount: BigNumber, price: BigNumber, expirationTimeSeconds: BigNumber, side: OrderSide) => Promise<OrderFeeData>;
}

type Props = StateProps & OwnProps & DispatchProps;

interface State {
    makerFeeAmount: BigNumber;
    takerFeeAmount: BigNumber;
    makerFeeAssetData?: string;
    takerFeeAssetData?: string;
    canOrderBeFilled?: boolean;
    quoteTokenAmount: BigNumber;
}

class OrderDetails extends React.Component<Props, State> {
    public state = {
        makerFeeAmount: ZERO,
        takerFeeAmount: ZERO,
        makerFeeAssetData: NULL_BYTES,
        takerFeeAssetData: NULL_BYTES,
        quoteTokenAmount: ZERO,
        canOrderBeFilled: true,
    };

    public componentDidUpdate = async (prevProps: Readonly<Props>) => {
        const newProps = this.props;
        if (
            newProps.tokenPrice !== prevProps.tokenPrice ||
            newProps.orderType !== prevProps.orderType ||
            newProps.tokenAmount !== prevProps.tokenAmount ||
            newProps.currencyPair !== prevProps.currencyPair ||
            newProps.orderSide !== prevProps.orderSide
        ) {
            await this._updateOrderDetailsState();
        }
    };

    public componentDidMount = async () => {
        await this._updateOrderDetailsState();
    };

    public render = () => {
        const fee = this._getFeeStringForRender();
        const cost = this._getCostStringForRender();
        const { orderSide } = this.props;
        const costText = orderSide === OrderSide.Sell ? 'Total' : 'Cost';
        return (
            <>
                <Row>
                    <FeeLabel>Fee</FeeLabel>
                    <Value>{fee}</Value>
                </Row>
                <Row>
                    <CostLabel>{costText}</CostLabel>
                    <CostValue>{cost}</CostValue>
                </Row>
            </>
        );
    };

    private readonly _updateOrderDetailsState = async () => {
        const { currencyPair, orderType, orderSide, ethAccount } = this.props;
        if (!currencyPair || !ethAccount) {
            return;
        }

        if (orderType === OrderType.Limit) {
            const { tokenAmount, tokenPrice, onFetchTakerAndMakerFee } = this.props;
            const { quote, base } = currencyPair;
            const quoteToken = getKnownTokens().getTokenBySymbol(quote);
            const baseToken = getKnownTokens().getTokenBySymbol(base);
            const priceInQuoteBaseUnits = Web3Wrapper.toBaseUnitAmount(tokenPrice, quoteToken.decimals);
            const baseTokenAmountInUnits = Web3Wrapper.toUnitAmount(tokenAmount, baseToken.decimals);
            const quoteTokenAmount = baseTokenAmountInUnits.multipliedBy(priceInQuoteBaseUnits);
            const { makerFee, makerFeeAssetData, takerFee, takerFeeAssetData } = await onFetchTakerAndMakerFee(
                tokenAmount,
                tokenPrice,
                getExpirationTimeOrdersFromConfig(),
                orderSide,
            );
            this.setState({
                makerFeeAmount: makerFee,
                makerFeeAssetData,
                takerFeeAmount: takerFee,
                takerFeeAssetData,
                quoteTokenAmount,
            });
        } else {
            const { tokenAmount, openSellOrders, openBuyOrders } = this.props;
            const isSell = orderSide === OrderSide.Sell;
            const [ordersToFill, amountToPayForEachOrder, canOrderBeFilled] = buildMarketOrders(
                {
                    amount: tokenAmount,
                    orders: isSell ? openBuyOrders : openSellOrders,
                },
                orderSide,
            );
            // HACK(dekz): we assume takerFeeAssetData is either empty or is consistent through all orders
            const firstOrderWithFees = ordersToFill.find(o => o.takerFeeAssetData !== NULL_BYTES);
            const takerFeeAssetData = firstOrderWithFees ? firstOrderWithFees.takerFeeAssetData : NULL_BYTES;
            const takerFeeAmount = ordersToFill.reduce((sum, order) => sum.plus(order.takerFee), ZERO);
            const quoteTokenAmount = sumTakerAssetFillableOrders(orderSide, ordersToFill, amountToPayForEachOrder);

            this.setState({
                takerFeeAmount,
                takerFeeAssetData,
                quoteTokenAmount,
                canOrderBeFilled,
            });
        }
    };

    private readonly _getFeeStringForRender = () => {
        const { orderType } = this.props;
        const { makerFeeAmount, makerFeeAssetData, takerFeeAmount, takerFeeAssetData } = this.state;
        // If its a Limit order the user is paying a maker fee
        const feeAssetData = orderType === OrderType.Limit ? makerFeeAssetData : takerFeeAssetData;
        const feeAmount = orderType === OrderType.Limit ? makerFeeAmount : takerFeeAmount;
        if (feeAssetData === NULL_BYTES) {
            return '0.00';
        }
        const feeToken = getKnownTokens().getTokenByAssetData(feeAssetData);

        return `${tokenAmountInUnits(
            feeAmount,
            feeToken.decimals,
            feeToken.displayDecimals,
        )} ${tokenSymbolToDisplayString(feeToken.symbol)}`;
    };

    private readonly _getCostStringForRender = () => {
        const { canOrderBeFilled } = this.state;
        const { orderType } = this.props;
        if (orderType === OrderType.Market && !canOrderBeFilled) {
            return `---`;
        }

        const { quote } = this.props.currencyPair;
        const quoteToken = getKnownTokens().getTokenBySymbol(quote);
        const { quoteTokenAmount } = this.state;
        const costAmount = tokenAmountInUnits(quoteTokenAmount, quoteToken.decimals, quoteToken.displayDecimals);
        return `${costAmount} ${tokenSymbolToDisplayString(quote)}`;
    };
}

const mapStateToProps = (state: StoreState): StateProps => {
    return {
        openSellOrders: getOpenSellOrders(state),
        openBuyOrders: getOpenBuyOrders(state),
        ethAccount: getEthAccount(state),
    };
};

const mapDispatchToProps = (dispatch: any): DispatchProps => {
    return {
        onFetchTakerAndMakerFee: (amount: BigNumber, price: BigNumber, expirationTimeSeconds: BigNumber, side: OrderSide) =>
            dispatch(fetchTakerAndMakerFee(amount, price, expirationTimeSeconds, side)),
    };
};

const OrderDetailsContainer = connect(
    mapStateToProps,
    mapDispatchToProps,
)(OrderDetails);

export { CostValue, OrderDetails, OrderDetailsContainer, Value };
