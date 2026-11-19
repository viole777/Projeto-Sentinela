'use strict';

function createMemoryRepository(initial = {}) {
  const state = structuredClone(initial);

  return {
    async read(collection) {
      return structuredClone(Array.isArray(state[collection]) ? state[collection] : []);
    },
    async append(collection, value) {
      if (!Array.isArray(state[collection])) state[collection] = [];
      state[collection].push(structuredClone(value));
      return structuredClone(value);
    },
    async replace(collection, values) {
      state[collection] = structuredClone(values);
      return structuredClone(state[collection]);
    }
  };
}

module.exports = { createMemoryRepository };
