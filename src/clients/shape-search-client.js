import axios from 'axios';
import utils from '../utils.js';

import BaseClient from './base-client';
// require('lodash');


class ShapeSearchClient extends BaseClient {

  fetch(input) {
    // console.log('shape-search-client fetch is running, input:', input);
    const data = input.map(a => a.properties.PARCELID);
    // console.log('shapeSearch DATA', data);

    const shapeSearchConfig = this.config.shapeSearch;
    const url = shapeSearchConfig.url;

    let params = this.evaluateParams(data, shapeSearchConfig);
    // console.log('shape-search-client fetch params:', params);

    const success = this.success.bind(this);
    const error = this.error.bind(this);

    return axios.get(url, { params })
      .then(success)
      .catch(error);
  }

  success(response) {
    // console.log('shapeSearch success response.data: ', response.data);

    const store = this.store;

    if (store.state.lastSearchMethod !== 'buffer search') {
      store.commit('setBufferShape', null);
    }

    let data = response.data;
    const url = response.config.url;

    data = this.evaluateDataForUnits(data);

    let features = data.rows;
    features.map(a => typeof a.pwd_parcel_id === 'string' ? a.pwd_parcel_id = Number(a.pwd_parcel_id):"");
    // console.log(features)
    features = this.assignFeatureIds(features, 'shape');
    // console.log(features)

    // store.commit('setShapeSearchUnits', units);
    store.commit('setShapeSearchData', data);
    store.commit('setShapeSearchStatus', 'success');
    store.commit('setDrawShape', null);

    return features;
  }

  error(error) {
    // console.log("shape search error response: ", error);
    return;
  }
}

export default ShapeSearchClient;
