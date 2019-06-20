

const initialState = {

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
  activeSearch: {
  },
  shapeSearch: {
    status: null,
    data: null,
    input: null,
  },
  condoUnits: {
    units: null,
  },
  lastSearchMethod: 'geocode',
};

const pvdStore = {
  createSources(config) {
    // console.log('createSources is running, config:', config);
    const sourceKeys = Object.keys(config.dataSources || {});
    const sources = sourceKeys.reduce((o, key) => {
      let val;
      // if the source has targets, just set it to be an empty object
      if (config.dataSources[key].targets) {
        // console.log('in config.dataSources[key].targets:', config.dataSources[key].targets);
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
  createActivesearch(config) {
    // console.log('createSources is running, config:', config);
    const sourceKeys = Object.keys(config.activeSearch || {});
    const sources = sourceKeys.reduce((o, key) => {
      let val = {
         status: null,
         data: null
       };
      o[key] = val;
      return o;
    }, {});
    return sources;
  },

  createParcels(config) {
    const parcelKeys = Object.keys(config.parcels || {});
    const parcels = parcelKeys.reduce((o, key) => {
      o[key] = null;
      return o;
    }, {});
    return parcels;
  },

  store: {
    state: initialState,
    mutations: {
      setClickCoords(state, payload) {
        state.clickCoords = payload;
      },
      setSourceStatus(state, payload) {
        // console.log('setSourceStatus is running, payload:', payload);
        const key = payload.key;
        const status = payload.status;

        // if a target id was passed in, set the status for that target
        const targetId = payload.targetId;

        if (targetId) {
          // console.log('store.js setSourceStatus, key:', key, 'status:', status, 'targetId:', targetId);
          state.sources[key].targets[targetId].status = status;
        } else {
          state.sources[key].status = status;
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
        const key = payload.key;
        const data = payload.data;

        // if a target id was passed in, set the data object for that target
        const targetId = payload.targetId;

        if (targetId) {
          if (state.sources[key].targets[targetId]) {
            state.sources[key].targets[targetId].data = data;
          }
        } else {
          state.sources[key].data = data;
        }
      },
      setSourceDataObject(state, payload) {
        const key = payload.key;
        const data = payload.data;
        state.sources[key].targets = data;
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
      setMapCenter(state, payload) {
        state.map.center = payload;
      },
      setMapZoom(state, payload) {
        state.map.zoom = payload;
      },
      setParcelData(state, payload) {
        // console.log('payload :', payload);
        const { data } = payload || {};
        // console.log('store setParcelData parcelLayer:', parcelLayer, 'data:', data, 'status:', status, 'activeParcel:', activeParcel);
        state.parcels.pwd = data;
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
      setShapeSearchStatus(state, payload) {
        state.shapeSearch.status = payload;
      },
      setShapeSearchData(state, payload) {
        state.shapeSearch.data = payload;
      },
      setShapeSearchDataPush(state, payload) {
        state.shapeSearch.data.rows = state.shapeSearch.data.rows.concat(payload)
      },
      setUnits(state, payload) {
        // console.log("setShapeSearchUnits: ", payload)
        state.condoUnits.units = payload;
      },
      setActiveSearchStatus(state, payload) {
        let key = payload.activeSearchKey;
        state.activeSearch[payload.activeSearchKey].status = payload.status;
      },
      setActiveSearchData(state, payload) {
        const key = payload.activeSearchKey
        const data = payload.data;
        state.activeSearch[key].data = data;
      },
      setDrawShape(state, payload) {
        state.drawShape.data = payload;
      },
      setOwnerSearchInput(state, payload) {
        state.ownerSearch.input = payload;
      },
      setBasemap(state, payload) {
        state.map.basemap = payload;
      },
      setImagery(state, payload) {
        state.map.imagery = payload;
      },
      setShouldShowImagery(state, payload) {
        state.map.shouldShowImagery = payload;
      },
      setShouldShowAddressCandidateList(state, payload) {
        state.shouldShowAddressCandidateList = payload;
      },
    }
  }
}

export default pvdStore;
