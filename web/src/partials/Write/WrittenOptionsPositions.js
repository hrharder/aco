import './WrittenOptionsPositions.css'
import React, { Component } from 'react'
import { withRouter } from 'react-router-dom'
import PropTypes from 'prop-types'
import { getOptionsPositions } from '../../util/acoFactoryMethods'
import { getOptionCollateralFormatedValue, getOptionTokenAmountFormatedValue, redeem, getFormattedOpenPositionAmount } from '../../util/acoTokenMethods'
import { ONE_SECOND, getNumberWithSignal } from '../../util/constants'
import { checkTransactionIsMined } from '../../util/web3Methods'
import StepsModal from '../StepsModal/StepsModal'
import MetamaskLargeIcon from '../Util/MetamaskLargeIcon'
import SpinnerLargeIcon from '../Util/SpinnerLargeIcon'
import DoneLargeIcon from '../Util/DoneLargeIcon'
import ErrorLargeIcon from '../Util/ErrorLargeIcon'
import Loading from '../Util/Loading'
import OptionBadge from '../OptionBadge'

class WrittenOptionsPositions extends Component {
  constructor(props) {
    super(props)
    this.state = { positions: null }
  }

  componentDidUpdate = (prevProps) => {
    if (this.props.selectedPair !== prevProps.selectedPair ||
      this.props.accountToggle !== prevProps.accountToggle) {
      this.setState({ positions: null })
      this.componentDidMount()
    }
  }

  componentDidMount = () => {
    getOptionsPositions(this.props.selectedPair, this.context.web3.selectedAccount).then(positions => this.setState({ positions: positions }))
  }

  onBurnClick = (position) => () => {
    this.props.onBurnPositionSelect(position)
  }

  isExpired = (position) => {
    return (position.option.expiryTime * ONE_SECOND) < new Date().getTime()
  }

  onRedeemClick = (position) => () => {
    var stepNumber = 0
    this.setStepsModalInfo(++stepNumber)
    redeem(this.context.web3.selectedAccount, position.option)
      .then(result => {
        if (result) {
          this.setStepsModalInfo(++stepNumber)
          checkTransactionIsMined(result)
            .then(result => {
              if (result) {
                this.setStepsModalInfo(++stepNumber)
              }
              else {
                this.setStepsModalInfo(-1)
              }
            })
            .catch(() => {
              this.setStepsModalInfo(-1)
            })
        }
        else {
          this.setStepsModalInfo(-1)
        }
      })
      .catch(() => {
        this.setStepsModalInfo(-1)
      })
  }

  setStepsModalInfo = (stepNumber) => {
    var title = "Redeem"
    var subtitle = "Redeem unassigned collateral"
    var img = null
    if (stepNumber === 1) {
      subtitle = "Confirm on Metamask to redeem back your collateral."
      img = <MetamaskLargeIcon />
    }
    else if (stepNumber === 2) {
      subtitle = "Redeeming..."
      img = <SpinnerLargeIcon />
    }
    else if (stepNumber === 3) {
      subtitle = "You have successfully redeemed your collateral."
      img = <DoneLargeIcon />
    }
    else if (stepNumber === -1) {
      subtitle = "An error ocurred. Please try again."
      img = <ErrorLargeIcon />
    }

    var steps = []
    steps.push({ title: "Redeem", progress: stepNumber > 2 ? 100 : 0, active: true })
    this.setState({
      stepsModalInfo: {
        title: title,
        subtitle: subtitle,
        steps: steps,
        img: img,
        isDone: (stepNumber === 3 || stepNumber === -1),
        onDoneButtonClick: (stepNumber === 3 ? this.onDoneButtonClick : this.onHideStepsModal)
      }
    })
  }

  onDoneButtonClick = () => {
    this.componentDidMount()
    this.setState({ stepsModalInfo: null })
  }

  onHideStepsModal = () => {
    this.setState({ stepsModalInfo: null })
  }

  render() {
    return (!this.state.positions ? <Loading/> :
      (this.state.positions.length === 0  ? <></> :
       <div className="written-options-positions">
      <div className="page-title">MANAGE YOUR WRITTEN OPTIONS POSITIONS</div>
      <table className="aco-table mx-auto">
        <thead>
          <tr>
            <th>TYPE</th>
            <th>SYMBOL</th>
            <th>TOTAL MINTED</th>
            <th>WALLET BALANCE</th>
            <th>OPEN POSITION</th>
            <th>TOTAL COLLATERAL<br />(assignable/unassignable)</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {this.state.positions.map(position =>
            <tr key={position.option.acoToken}>
              <td><OptionBadge isCall={position.option.isCall}></OptionBadge></td>
              <td>{position.option.acoTokenInfo.symbol}</td>
              <td>{getOptionTokenAmountFormatedValue(position.currentCollateralizedTokens, position.option)}</td>
              <td>{getOptionTokenAmountFormatedValue(position.balance, position.option)}</td>
              <td>{getNumberWithSignal(getFormattedOpenPositionAmount(position))}</td>
              <td>{getOptionCollateralFormatedValue(position.currentCollateral, position.option)}<br />
              ({getOptionCollateralFormatedValue(position.assignableCollateral, position.option)}/{getOptionCollateralFormatedValue(position.unassignableCollateral, position.option)})
              </td>
              <td>
                {!this.isExpired(position) && <div className="position-actions">
                  <div title="Available only after expiry">Redeem collateral</div>
                  <div className="clickable" onClick={this.onBurnClick(position)}>Burn to redeem collateral</div>
                </div>}
                {this.isExpired(position) && <div className="position-actions">
                  <div className="clickable" onClick={this.onRedeemClick(position)}>Redeem collateral</div>
                </div>}
              </td>
            </tr>)}
        </tbody>
      </table>
      {this.state.stepsModalInfo && <StepsModal {...this.state.stepsModalInfo} onHide={this.onHideStepsModal}></StepsModal>}
    </div>))
  }
}

WrittenOptionsPositions.contextTypes = {
  web3: PropTypes.object
}
export default withRouter(WrittenOptionsPositions)