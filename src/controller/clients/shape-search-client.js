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
    // console.log("evaluateDataForUnits data: ", data);
    // console.log("evaluateDataForUnits dataRows: ",dataRows);
    let groupedData = _.groupBy(data.rows, a => a.pwd_parcel_id);
    // console.log("evaluateDataForUnits groupedData: ", groupedData);

    var units = [], filteredData, dataList = [];

    for (let item in groupedData){
      groupedData[item].length > 1 ? units.push.apply(units,groupedData[item]) :
      dataList.push(groupedData[item][0])
    }

    let mObj = JSON.parse(JSON.stringify(data.rows[0]))

    if(units.length > 0) {
      units = _.groupBy(units, a => a.pwd_parcel_id);
      data.rows = data.rows.filter(a => !Object.keys(units).includes(a.pwd_parcel_id));
    }

    // console.log("Units List: ", units, "Data: ", data )
    this.store.commit('setUnits', units);

    for (let unit in units) {
      // console.log("Unit: ", units[unit])
      for (let i in mObj) { mObj[i] = ""  }
      let mObjPush = JSON.parse(JSON.stringify(mObj))
      mObjPush.location = units[unit][0].location
      mObjPush.condo = true
      mObjPush.pwd_parcel_id = units[unit][0].pwd_parcel_id
      data.rows.push(mObjPush)
    }
    return data
  }

  fetch(input) {
    // console.log('shapeSearch client fetch', input);
    const data =  input.map(a => a.properties.PARCELID)
    // console.log('shapeSearch DATA', data);

    const store = this.store;
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
    data = this.evaluateDataForUnits(data);

    let features = data.rows
    features.map(a => typeof a.pwd_parcel_id === 'string' ? a.pwd_parcel_id = Number(a.pwd_parcel_id):"")
    // console.log(features)
    features = this.assignFeatureIds(features, 'shape');
    // console.log(features)


    // store.commit('setShapeSearchUnits', units);
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
