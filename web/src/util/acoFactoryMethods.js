import { getWeb3 } from './web3Methods'
import { acoFactoryAddress, ONE_SECOND, sortBy, sortByFn } from './constants';
import { acoFactoryABI } from './acoFactoryABI';
import { getERC20AssetInfo } from './erc20Methods';
import { acoFee, unassignableCollateral, currentCollateral, assignableCollateral, balanceOf, getOpenPositionAmount, currentCollateralizedTokens, unassignableTokens, assignableTokens } from './acoTokenMethods';

var acoFactoryContract = null
function getAcoFactoryContract() {
    if (acoFactoryContract == null) {
        const _web3 = getWeb3()
        if (_web3) {
            acoFactoryContract = new _web3.eth.Contract(acoFactoryABI, acoFactoryAddress)
        }
    }
    return acoFactoryContract
}

var availableOptions = null
function getAllAvailableOptions() {
    return new Promise((resolve, reject) => {
        if (availableOptions != null) {
            resolve(availableOptions)
        }
        else {
            const acoFactoryContract = getAcoFactoryContract()
            acoFactoryContract.getPastEvents('NewAcoToken', { fromBlock: 0, toBlock: 'latest' }).then((events) => {
                var assetsAddresses = []
                availableOptions = []
                for (let i = 0; i < events.length; i++) {
                    const eventValues = events[i].returnValues;
                    availableOptions.push(eventValues)
                    if (!assetsAddresses.includes(eventValues.strikeAsset)) {
                        assetsAddresses.push(eventValues.strikeAsset)
                    }
                    if (!assetsAddresses.includes(eventValues.underlying)) {
                        assetsAddresses.push(eventValues.underlying)
                    }
                }
                fillTokensInformations(availableOptions, assetsAddresses).then(options => resolve(options))
            })
        }
    })
}

function fillTokensInformations(options, assetsAddresses) {
    return new Promise((resolve, reject) => {
        var assetsInfo = {}
        var promises = []
        for (let i = 0; i < assetsAddresses.length; i++) {
            var promise = getERC20AssetInfo(assetsAddresses[i])
            promises.push(promise)
            promise.then(result => {
                assetsInfo[assetsAddresses[i]] = result
            })
        }
        Promise.all(promises).then(() => {
            var acoTokenPromises = []
            for (let i = 0; i < options.length; i++) {
                var acoTokenPromise = getERC20AssetInfo(options[i].acoToken)
                acoTokenPromises.push(acoTokenPromise)
                acoTokenPromise.then(result => {
                    options[i].acoTokenInfo = result
                    options[i].underlyingInfo = assetsInfo[options[i].underlying]
                    options[i].strikeAssetInfo = assetsInfo[options[i].strikeAsset]
                })

                var acoTokenFeePromise = acoFee(options[i])
                acoTokenPromises.push(acoTokenFeePromise)
                acoTokenFeePromise.then(result => {
                    options[i].acoFee = result
                })                
            }
            Promise.all(acoTokenPromises).then(() => {
                resolve(options)
            })            
        })
    })
}


export const listPairs = () => {
    return new Promise((resolve, reject) => {
        getAllAvailableOptions().then(options => {
            var pairs = {}
            for (let i = 0; i < options.length; i++) {
                const option = options[i];
                if (!pairs[option.underlyingInfo.symbol + "_" + option.strikeAssetInfo.symbol]) {
                    pairs[option.underlyingInfo.symbol + "_" + option.strikeAssetInfo.symbol] = {
                        id: option.underlyingInfo.symbol + "_" + option.strikeAssetInfo.symbol,
                        underlying: option.underlying,
                        underlyingInfo: option.underlyingInfo,
                        underlyingSymbol: option.underlyingInfo.symbol,
                        strikeAsset: option.strikeAsset,
                        strikeAssetInfo: option.strikeAssetInfo,
                        strikeAssetSymbol: option.strikeAssetInfo.symbol
                    }
                }
            }
            resolve(Object.values(pairs))
        })
    })
}

export const listOptions = (pair, optionType = null, removeExpired = false) => {
    return new Promise((resolve, reject) => {
        getAllAvailableOptions().then(availableOptions => {
            var options = []
            for (let i = 0; i < availableOptions.length; i++) {
                const option = availableOptions[i];
                if (option.underlyingInfo.symbol === pair.underlyingSymbol && 
                    option.strikeAssetInfo.symbol === pair.strikeAssetSymbol && 
                    (!optionType || (optionType === 1 ? option.isCall : !option.isCall)) && 
                    (!removeExpired || ((option.expiryTime * ONE_SECOND) > new Date().getTime()))) {
                    options.push(option)
                }
            }
            var sortedOptions = sortBy(options, "isCall")
            resolve(sortedOptions)
        })
    })
}

export const getOptionPairIdFromAddress = (optionAddress) => {
    return new Promise((resolve, reject) => {
        getAllAvailableOptions().then(availableOptions => {
            for (let i = 0; i < availableOptions.length; i++) {
                const option = availableOptions[i];
                if (option.acoToken === optionAddress) {
                    resolve(option.underlyingInfo.symbol + "_" + option.strikeAssetInfo.symbol)
                    return;
                }
            }
            resolve(null)
        })
    })
}

export function getOptionsPositions(pair, userAccount) {
    return new Promise((resolve, reject) => {
        listOptions(pair).then(options => {
            var positions = []
            for (let i = 0; i < options.length; i++) {
                getPositionForOption(options[i], userAccount).then(position => {
                    if (position.currentCollateral > 0) {
                        positions.push(position)
                    }
                    if ((options.length - 1) === i) {
                        resolve(positions)
                    }
                })
            }
        })
    })
}

export function listPositionsForExercise(pair, userAccount) {
    return new Promise((resolve, reject) => {
        listOptions(pair, null, true).then(options => {
            var positions = []
            for (let i = 0; i < options.length; i++) {
                getPositionForOption(options[i], userAccount).then(position => {
                    if (position.openPosition > 0) {
                        positions.push(position)
                    }

                    if ((options.length - 1) === i) {
                        var sortedPositions = sortByFn(positions, (p) => p.option.isCall)
                        resolve(sortedPositions)
                    }
                })
            }
        })
    })
}

function getPositionForOption(option, userAccount) {
    return new Promise((resolve, reject) => {
        var promises = []
        promises.push(currentCollateral(option, userAccount))
        promises.push(assignableCollateral(option, userAccount))
        promises.push(unassignableCollateral(option, userAccount))
        promises.push(currentCollateralizedTokens(option, userAccount))
        promises.push(unassignableTokens(option, userAccount))
        promises.push(assignableTokens(option, userAccount))
        promises.push(balanceOf(option, userAccount))
        Promise.all(promises).then(results => {
            var position = {
                option: option, 
                currentCollateral: results[0],
                assignableCollateral: results[1],
                unassignableCollateral: results[2],
                currentCollateralizedTokens: results[3],
                unassignableTokens: results[4],
                assignableTokens: results[5],
                balance: results[6]
            }
            position.openPosition = getOpenPositionAmount(position)
            resolve(position)
        })
    })
}
