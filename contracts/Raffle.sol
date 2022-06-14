// SPDX-License-Identifier: MIT

pragma solidity ^0.8.7;

import "@chainlink/contracts/src/v0.8/VRFConsumerBaseV2.sol";
import "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol";
import "@chainlink/contracts/src/v0.8/interfaces/KeeperCompatibleInterface.sol";

error Raffle__NotEnoughEthEntered();
error Raffle__TRansferToWinnerFailed();
error Raffle__NotOpen();
error Raffle__UpkeepNotNeeded(
  uint256 currentBalance,
  uint256 numPlayers,
  uint256 raffleStatus
);

/** @title A sample raffle contract
 *  @author Andrea Cardinale
 *  @dev this implement Chainlink VRF V2 and Chainlink Keepers
 */

contract Raffle is VRFConsumerBaseV2, KeeperCompatibleInterface {
  // Types declarations
  enum RaffleState {
    OPEN,
    CALCULATING
  }

  // state variables
  uint256 private immutable i_entranceFee;
  address payable[] private s_players;
  VRFCoordinatorV2Interface private immutable i_vrfCoordinator;
  bytes32 private immutable i_gasLane;
  uint64 private immutable i_subscriptionId;
  uint32 private immutable i_callBackGasLimit;
  uint16 private constant REQUEST_CONFIRMATIONS = 3;
  uint32 private constant NUM_WORDS = 1;

  // lottery variables
  address private s_recentWinner;
  RaffleState private s_raffleState;
  uint256 private s_lastTimestamp;
  uint256 private immutable i_interval;

  // events
  event RaffleEnter(address indexed player);
  event RequestedRaffleWinner(uint256 indexed requestId);
  event WinnerPicked(address indexed winner);

  // funtions
  constructor(
    address vrefCoordinatorV2,
    uint256 entranceFee,
    bytes32 gasLane,
    uint64 subscriptionId,
    uint32 callbackGasLimit,
    uint256 interval
  ) VRFConsumerBaseV2(vrefCoordinatorV2) {
    i_entranceFee = entranceFee;
    i_vrfCoordinator = VRFCoordinatorV2Interface(vrefCoordinatorV2);
    i_gasLane = gasLane;
    i_subscriptionId = subscriptionId;
    i_callBackGasLimit = callbackGasLimit;
    s_raffleState = RaffleState.OPEN;
    s_lastTimestamp = block.timestamp;
    i_interval = interval;
  }

  function enterRaffle() public payable {
    if (msg.value < i_entranceFee) {
      revert Raffle__NotEnoughEthEntered();
    }
    if (s_raffleState != RaffleState.OPEN) {
      revert Raffle__NotOpen();
    }
    s_players.push(payable(msg.sender));
    emit RaffleEnter(msg.sender);
  }

  /**
   * @dev fcuntion called by chainlink. Upkeep is performed when the function return true.
   * The following condition should be true
   * 1. time interval passed
   * 2. the lottery should have at least 1 player and some funds
   * 3. Our subscription is fundded with LINK
   * 4. The lottery is "open"
   */
  function checkUpkeep(
    bytes memory // checkData
  )
    public
    view
    override
    returns (
      bool upkeepNeeded,
      bytes memory /* performData */
    )
  {
    bool isOpen = (s_raffleState == RaffleState.OPEN);
    bool timePassed = ((block.timestamp - s_lastTimestamp) > i_interval);
    bool hasPlayers = s_players.length > 0;
    bool hasBalance = address(this).balance > 0;
    upkeepNeeded = isOpen && timePassed && hasPlayers && hasBalance;
  }

  function performUpkeep(
    bytes calldata /* performData */
  ) external override {
    (bool upkeepNeed, ) = checkUpkeep("");
    if (!upkeepNeed) {
      revert Raffle__UpkeepNotNeeded(
        address(this).balance,
        s_players.length,
        uint256(s_raffleState)
      );
    }
    s_raffleState = RaffleState.CALCULATING;
    uint256 requestId = i_vrfCoordinator.requestRandomWords(
      i_gasLane,
      i_subscriptionId,
      REQUEST_CONFIRMATIONS,
      i_callBackGasLimit,
      NUM_WORDS
    );
    emit RequestedRaffleWinner(requestId);
  }

  function fulfillRandomWords(
    uint256, //requestId,
    uint256[] memory randomWords
  ) internal override {
    uint256 indexOfWinner = randomWords[0] % s_players.length;
    address payable recentWinner = s_players[indexOfWinner];
    s_recentWinner = recentWinner;
    s_raffleState = RaffleState.OPEN;
    s_players = new address payable[](0);
    s_lastTimestamp = block.timestamp;
    (bool success, ) = recentWinner.call{value: address(this).balance}("");
    if (!success) revert Raffle__TRansferToWinnerFailed();
    emit WinnerPicked(recentWinner);
  }

  // view/pure functions
  function getEntranceFee() public view returns (uint256) {
    return i_entranceFee;
  }

  function getPlayer(uint256 _index) public view returns (address) {
    return s_players[_index];
  }

  function getRecentWinner() public view returns (address) {
    return s_recentWinner;
  }

  function getNumWords() public pure returns (uint32) {
    return NUM_WORDS;
  }

  function getNumberOfPlayers() public view returns (uint256) {
    return s_players.length;
  }

  function getLatestTimeStamp() public view returns (uint256) {
    return s_lastTimestamp;
  }

  function getRequestConfirmations() public pure returns (uint16) {
    return REQUEST_CONFIRMATIONS;
  }

  function getInterval() public view returns (uint256) {
    return i_interval;
  }

  function getRaffleState() public view returns (RaffleState) {
    return s_raffleState;
  }
}
