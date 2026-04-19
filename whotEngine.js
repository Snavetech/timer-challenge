// whotEngine.js
const SHAPES = ['circle', 'triangle', 'cross', 'square', 'star'];
const NUMBERS = [1, 2, 3, 4, 5, 7, 8, 10, 11, 12, 13, 14]; // Missing 20, 20 is wild

function generateDeck() {
  const deck = [];
  let idCounter = 1;
  for (const shape of SHAPES) {
    for (const num of NUMBERS) {
      deck.push({ id: idCounter++, shape, number: num, isSpecial: [2, 5].includes(num) });
    }
  }
  // Add four 20s (Whot)
  for (let i = 0; i < 4; i++) {
    deck.push({ id: idCounter++, shape: 'whot', number: 20, isSpecial: true });
  }
  return shuffle(deck);
}

function shuffle(array) {
  const newArr = [...array];
  for (let i = newArr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
  }
  return newArr;
}

function setupWhotState(playersMap) {
  const deck = generateDeck();
  const hands = new Map();
  const playerIds = Array.from(playersMap.keys());
  
  // Deal 4 cards to each player
  for (const id of playerIds) {
    const hand = [];
    for (let i=0; i<4; i++) {
       hand.push(deck.pop());
    }
    hands.set(id, hand);
  }

  let startingCard;
  while(true) {
    startingCard = deck.pop();
    if (startingCard.number !== 2 && startingCard.number !== 5 && startingCard.number !== 20) {
      break;
    } else {
      deck.unshift(startingCard);
    }
  }

  return {
    phase: 'playing',
    deck,
    discardPile: [startingCard],
    turnIndex: 0,
    playerIds,
    declaredShape: null,
    hands,
    attack: {
      active: false,
      cardType: null,
      stackCount: 0
    },
    pendingCover: {
      active: false,
      playerId: null
    }
  };
}

function calculatePenalties(handsMap) {
  const penalties = new Map();
  for (const [playerId, hand] of handsMap) {
    if (hand.length === 0) {
      penalties.set(playerId, 0);
      continue;
    }
    let score = 0;
    for (const card of hand) {
      if (card.number === 20) score += 20;
      else if (card.number === 8) score += 8;
      else score += card.number;
    }
    penalties.set(playerId, score);
  }
  return penalties;
}

function isValidPlay(state, card) {
  const topCard = state.discardPile[state.discardPile.length - 1];

  // If pending cover, MUST play another card to cover the 2
  if (state.pendingCover.active) {
    if (card.number === 2) return true; // Stacking 2s
    if (card.shape === topCard.shape || card.number === topCard.number || card.number === 20) {
      return true; // Covered successfully
    }
    return false;
  }

  // Active Attack (Pick 2 or Pick 3)
  if (state.attack.active) {
    if (state.attack.cardType === 2 && card.number === 2) return true;
    if (state.attack.cardType === 5 && card.number === 5) return true;
    return false; // MUST draw if they don't have a matching attack card
  }

  // Whot 20 declared shape
  if (state.declaredShape) {
    if (card.number === 20) return true;
    if (card.shape === state.declaredShape) return true;
    return false;
  }

  // Standard match
  if (card.shape === topCard.shape || card.number === topCard.number || card.number === 20) {
    return true;
  }

  return false;
}

function advanceTurn(state) {
  state.turnIndex = (state.turnIndex + 1) % state.playerIds.length;
}

function processPlayCard(state, playerId, cardId, declaredShape) {
  const currentPlayerId = state.playerIds[state.turnIndex];
  if (playerId !== currentPlayerId) return { error: 'Not your turn' };

  const hand = state.hands.get(playerId);
  const cardIndex = hand.findIndex(c => c.id === cardId);
  if (cardIndex === -1) return { error: 'Card not found in hand' };

  const card = hand[cardIndex];
  
  if (!isValidPlay(state, card)) {
    return { error: 'Invalid move' };
  }

  // Remove card from hand
  hand.splice(cardIndex, 1);
  state.discardPile.push(card);
  state.declaredShape = null;

  // Check victory prior to turn resolution
  if (hand.length === 0) {
    return { action: 'win', card };
  }

  if (card.number === 20) {
    if (declaredShape && SHAPES.includes(declaredShape)) {
      state.declaredShape = declaredShape;
    }
  }

  if (card.number === 2) {
    if (state.attack.active && state.attack.cardType === 2) {
      state.attack.stackCount += 2;
    } else {
      state.attack.active = true;
      state.attack.cardType = 2;
      state.attack.stackCount += 2;
    }
    state.pendingCover.active = true;
    state.pendingCover.playerId = playerId;
  } else if (state.pendingCover.active) {
    state.pendingCover.active = false;
    advanceTurn(state);
  } else if (card.number === 5) {
    if (state.attack.active && state.attack.cardType === 5) {
      state.attack.stackCount += 3;
    } else {
      state.attack.active = true;
      state.attack.cardType = 5;
      state.attack.stackCount = 3;
    }
    advanceTurn(state);
  } else {
    advanceTurn(state);
  }

  return { action: 'played', card };
}

function processDrawCard(state, playerId) {
  const currentPlayerId = state.playerIds[state.turnIndex];
  if (playerId !== currentPlayerId) return { error: 'Not your turn' };

  const hand = state.hands.get(playerId);
  let drawCount = 1;
  let drewForAttack = false;

  if (state.pendingCover.active) {
    drawCount = 1;
    state.pendingCover.active = false;
  } else if (state.attack.active) {
    drawCount = state.attack.stackCount;
    state.attack.active = false;
    state.attack.stackCount = 0;
    state.attack.cardType = null;
    drewForAttack = true;
  }

  for (let i = 0; i < drawCount; i++) {
    if (state.deck.length === 0) {
      if (state.discardPile.length <= 1) break;
      const top = state.discardPile.pop();
      state.deck = shuffle(state.discardPile);
      state.discardPile = [top];
    }
    if (state.deck.length > 0) hand.push(state.deck.pop());
  }

  advanceTurn(state);
  return { drawCount, drewForAttack };
}

module.exports = {
  generateDeck,
  setupWhotState,
  calculatePenalties,
  isValidPlay,
  advanceTurn,
  processPlayCard,
  processDrawCard
};
