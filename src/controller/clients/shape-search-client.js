import axios from 'axios';
import BaseClient from './base-client';
require('lodash');


class ShapeSearchClient extends BaseClient {

  evaluateParams(feature, dataSource) {
    // console.log('http-client evaluateParams is running');
    const params = {};
    if (!dataSource.options.params) { return params };
    const paramEntries = Object.entries(dataSource.options.params);
    const state = this.store.state;

    for (let [key, valOrGetter] of paramEntries) {
      let val;

      if (typeof valOrGetter === 'function') {
        // console.log(feature);
        val = valOrGetter(feature);
      } else {
        val = valOrGetter;
      }
      params[key] = val;
    }
    return params;
  }

  evaluateDataForUnits(data) {
    console.log("evaluateDataForUnits data: ", data);
    let dataRows = data.rows;
    // console.log("evaluateDataForUnits dataRows: ",dataRows);
    let groupedData = _.groupBy(dataRows, a => a.pwd_parcel_id);
    // console.log("evaluateDataForUnits groupedData: ", groupedData);

    var unitsList = [],
    dataList = [];

    for (let item in groupedData){
      groupedData[item].length > 1 ? unitsList.push.apply(unitsList,groupedData[item]) :
      dataList.push(groupedData[item][0])
    }

    unitsList.length > 0 ? unitsList = _.groupBy(unitsList, a => a.pwd_parcel_id): ""

    console.log("Units List: ", unitsList, "Data list: ", dataList )

    return unitsList
  }

  fetch(input) {
    console.log('shapeSearch client fetch', input);
    const data =  input.map(a => a.properties.PARCELID.toString())
    console.log('shapeSearch DATA', data);

    const store = this.store;

    console.log(this.config)
    const shapeSearchConfig = this.config.shapeSearch;
    const url = shapeSearchConfig.url;

    let params = this.evaluateParams(data, shapeSearchConfig);

    const success = this.success.bind(this);
    const error = this.error.bind(this);

    return axios.get(url, { params })
                                    .then(success)
                                    .catch(error);
  }

  success(response) {
    // console.log("success respose: ", response);

    const store = this.store;
    let data = response.data;
    const url = response.config.url;

    // this.evaluateDataForCondos(data);

    let units = this.evaluateDataForUnits(data);
    // console.log(data)

    let features = data.rows
    // console.log(features)
    features = this.assignFeatureIds(features, 'shape');
    // console.log(features)

    console.log(units)
    store.commit('setShapeSearchUnits', units);
    store.commit('setShapeSearchData', data);
    store.commit('setShapeSearchStatus', 'success');
    store.commit('setDrawShape', null)

    return features;
  }

  error(error) {
    // console.log("error respose: ", error);
    return
  }
}

export default ShapeSearchClient;
