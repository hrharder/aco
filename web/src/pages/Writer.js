import './Writer.css'
import React, { Component } from 'react'
import { withRouter } from 'react-router-dom'
import PropTypes from 'prop-types'
import StepIndicator from '../partials/Write/StepIndicator'
import WriteStep1 from '../partials/Write/WriteStep1'
import WriteStep2 from '../partials/Write/WriteStep2'
import WriteStep3 from '../partials/Write/WriteStep3'
import WrittenOptionsPositions from '../partials/Write/WrittenOptionsPositions'
import Burn from '../partials/Write/Burn'
import Loading from '../partials/Util/Loading'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faExclamationCircle } from '@fortawesome/free-solid-svg-icons'

class Writer extends Component {
  constructor() {
    super()
    this.state = { currentStep: 1}
  }

  componentDidMount = () => {
    if (!this.canLoad()) {
      this.props.history.push('/')
    }
  }

  canLoad = () => {
    return this.context && this.context.web3 && this.context.web3.selectedAccount && this.context.web3.validNetwork
  }

  setOptionType = (optionType) => {
    this.setState({optionType: optionType, currentStep: 2})
  }

  setOption = (option) => {
    this.setState({option: option, currentStep: 3})
  }

  setCurrentStep = (step) => {
    this.setState({currentStep: step})
  }

  onCancelClick = () => {
    this.setCurrentStep(1)
  }

  onBurnPositionSelect = (position) => {
    this.setState({position: position, currentStep: 4})
  }

  render() {
    return <div className="py-4">
      {this.canLoad() && <>
        <div className="beta-alert"><FontAwesomeIcon icon={faExclamationCircle}></FontAwesomeIcon>This project is in beta. Use at your own risk.</div>
        {this.state.currentStep !== 4 && <div className="page-title">MINT OPTIONS</div>}
        {this.state.currentStep !== 4 && <StepIndicator totalSteps={3} current={this.state.currentStep} setCurrentStep={this.setCurrentStep}></StepIndicator>}
        {!this.props.selectedPair && <Loading/>}
        {this.props.selectedPair &&  <>
          {this.state.currentStep === 1 && <WriteStep1 {...this.props} setOptionType={this.setOptionType}></WriteStep1>}
          {this.state.currentStep === 2 && <WriteStep2 {...this.props} optionType={this.state.optionType} setOption={this.setOption}></WriteStep2>}
          {this.state.currentStep === 3 && <WriteStep3 {...this.props} option={this.state.option} onCancelClick={this.onCancelClick}></WriteStep3>}
          {this.state.currentStep === 1 && <WrittenOptionsPositions {...this.props} onBurnPositionSelect={this.onBurnPositionSelect}></WrittenOptionsPositions>}
          {this.state.currentStep === 4 && <Burn {...this.props} position={this.state.position} onCancelClick={this.onCancelClick}></Burn>}
        </>}
      </>}
      </div>
  }
}

Writer.contextTypes = {
  web3: PropTypes.object
}
export default withRouter(Writer)