

const initialState = {
  // this gets set to the parcel layer for the default (aka first) topic in
  // DataManager.resetGeocode, which is called by Router.hashChanged on app
  // load.
  activeTopic: '',
  activeParcelLayer: '',
  clickCoords: null,
  // should addresscandidate be here if neither pvm or pvc were included?
  shouldShowAddressCandidateList: false,
  // the ais feature
  geocode: {
    status: null,
    data: null,
    input: null,
    related: null,
  },
  ownerSearch: {
    status: null,
    data: null,
    input: null,
  },
  searchType: 'address',
  lastSearchMethod: 'geocode',
  modals: {
    keys: [],
    open: '',
  },
  selectedServices: [],
  selectedKeywords: [],

};

const pvdStore = {
  createSources(config) {
    // console.log('createSources is running, config:', config);
    const sourceKeys = Object.keys(config.dataSources || {});
    const sources = sourceKeys.reduce((o, key) => {
      let val;
      // if the source has targets, just set it to be an empty object
      if (config.dataSources[key].targets) {
        val = {
          targets: {}
        };
      } else {
        val = {
         // we have to define these here, because vue can't observe properties that
         // are added later.
         status: null,
         secondaryStatus: null,
         data: null
       };
      }

      o[key] = val;

      return o;
    }, {});
    return sources;
  },

  createPinSources(config) {
    // console.log('createSources is running, config:', config);
    const sourceKeys = Object.keys(config.pinSources || {});
    const sources = sourceKeys.reduce((o, key) => {
      let val;
      // if the source has targets, just set it to be an empty object
      if (config.pinSources[key].targets) {
        val = {
          targets: {}
        };
      } else {
        val = {
         // we have to define these here, because vue can't observe properties that
         // are added later.
         status: null,
         secondaryStatus: null,
         data: null
       };
      }

      o[key] = val;

      return o;
    }, {});
    return sources;
  },

  createParcels(config) {
    const parcelKeys = Object.keys(config.parcels || {});
    const parcels = parcelKeys.reduce((o, key) => {
      let val;
      if (config.parcels[key].multipleAllowed) {
        val = {
          data: [],
          status: null,
          activeParcel: null,
          activeAddress: null,
          activeMapreg: null
        };
      } else {
        val = null;
        // val = {
        //   geometry: null,
        //   id: null,
        //   properties: null,
        //   type: null
        // };
      }

      o[key] = val;

      return o;
    }, {});
    return parcels;
  },

  store: {
    state: initialState,
    mutations: {
      setSelectedServices(state, payload) {
        state.selectedServices = payload;
      },
      setSelectedKeywords(state, payload) {
        state.selectedKeywords = payload;
      },
      setSearchType(state, payload) {
        state.searchType = payload;
      },
      setActiveParcelLayer(state, payload) {
        state.activeParcelLayer = payload;
      },
      setActiveTopic(state, payload) {
        state.activeTopic = payload;
      },
      setClickCoords(state, payload) {
        state.clickCoords = payload;
      },
      setSourceStatus(state, payload) {
        // console.log('setSourceStatus is running, payload:', payload, 'state', state);
        const key = payload.key;
        const status = payload.status;

        // if a target id was passed in, set the status for that target
        const targetId = payload.targetId;

        if (targetId) {
          // console.log('store.js setSourceStatus, key:', key, 'status:', status, 'targetId:', targetId);
          state.sources[key].targets[targetId].status = status;
        } else if (Object.keys(state.sources).includes(payload.key)) {
          state.sources[key].status = status;
        } else {
          state.pinSources[key].status = status;
        }
      },
      setSecondarySourceStatus(state, payload) {
        const key = payload.key;
        const secondaryStatus = payload.secondaryStatus;

        // if a target id was passed in, set the status for that target
        const targetId = payload.targetId;

        // if (targetId) {
        //   state.sources[key].targets[targetId].status = status;
        // } else {
        state.sources[key].secondaryStatus = secondaryStatus;
        // }
      },
      setSourceData(state, payload) {
        // console.log('store setSourceData payload:', state);
        const key = payload.key;
        const data = payload.data;

        // if a target id was passed in, set the data object for that target
        const targetId = payload.targetId;

        if (targetId) {
          if (state.sources[key].targets[targetId]) {
            state.sources[key].targets[targetId].data = data;
          }
        } else if (Object.keys(state.sources).includes(payload.key)) {
          state.sources[key].data = data;
        } else {
          state.pinSources[key].data = data;
        }
      },
      setSourceDataMore(state, payload) {
        const key = payload.key;
        const data = payload.data;
        const nextPage = payload.page;
        const oldData = state.sources[key].data;
        // console.log('oldData features', oldData.features, 'data features', data.features);
        const allData = oldData.features.concat(data.features);
        // console.log('allData', allData);
        // if a target id was passed in, set the data object for that target
        // const targetId = payload.targetId;

        // if (targetId) {
        //   state.sources[key].targets[targetId].data = data;
        // } else {

        state.sources[key].data.features = allData;
        state.sources[key].data.page = nextPage;
        // }
      },
      // this sets empty targets for a data source
      createEmptySourceTargets(state, payload) {
        const {key, targetIds} = payload;
        state.sources[key].targets = targetIds.reduce((acc, targetId) => {
          acc[targetId] = {
            status: null,
            data: null
          };
          return acc;
        }, {});
      },
      clearSourceTargets(state, payload) {
        const key = payload.key;
        state.sources[key].targets = {};
      },
      // this is the map center as an xy coordinate array (not latlng)
      setParcelData(state, payload) {
        // console.log('store setParcelData payload:', payload);
        const { parcelLayer, data, multipleAllowed, status, activeParcel, activeAddress, activeMapreg } = payload || {};
        // console.log('store setParcelData parcelLayer:', parcelLayer, 'data:', data, 'multipleAllowed:', multipleAllowed, 'status:', status, 'activeParcel:', activeParcel);
        if (!multipleAllowed) {
          state.parcels[parcelLayer] = data;
        } else {
          state.parcels[parcelLayer].data = data;
          state.parcels[parcelLayer].status = status;
          state.parcels[parcelLayer].activeParcel = activeParcel;
          state.parcels[parcelLayer].activeAddress = activeAddress;
          state.parcels[parcelLayer].activeMapreg = activeMapreg;
        }
      },
      setLastSearchMethod(state, payload) {
        state.lastSearchMethod = payload;
      },
      setGeocodeStatus(state, payload) {
        state.geocode.status = payload;
      },
      setGeocodeData(state, payload) {
        state.geocode.data = payload;
      },
      setGeocodeRelated(state, payload) {
        state.geocode.related = payload;
      },
      setGeocodeInput(state, payload) {
        state.geocode.input = payload;
      },
      setOwnerSearchStatus(state, payload) {
        state.ownerSearch.status = payload;
      },
      setOwnerSearchData(state, payload) {
        state.ownerSearch.data = payload;
      },
      setOwnerSearchInput(state, payload) {
        state.ownerSearch.input = payload;
      },
      setShouldShowAddressCandidateList(state, payload) {
        state.shouldShowAddressCandidateList = payload;
      },
      setDidToggleModal(state, name) {
        state.modals.open = name;
      },
    }
  }
}

export default pvdStore;
