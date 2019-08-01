import axios from 'axios';
import moment from 'moment';
import BaseClient from './base-client';

class HttpClient extends BaseClient {
  // evaluateParams(feature, dataSource) {
  //   console.log('http-client evaluateParams is running');
  //   const params = {};
  //   if (!dataSource.options.params) { return params };
  //   const paramEntries = Object.entries(dataSource.options.params);
  //   const state = this.store.state;
  //
  //   for (let [key, valOrGetter] of paramEntries) {
  //     let val;
  //
  //     if (typeof valOrGetter === 'function') {
  //       val = valOrGetter(feature, state);
  //     } else {
  //       val = valOrGetter;
  //     }
  //
  //     params[key] = val;
  //   }
  //
  //   return params;
  // }

  fetchDataInSegments(feature, dataSource, dataSourceKey, targetIdFn, params){
    // console.log('http-client fetch, feature:', feature, 'dataSource:', dataSource, 'dataSourceKey:', dataSourceKey, 'targetIdFn:', targetIdFn, 'params:', params);



    let featureArr = feature.split(',')
    // console.log("Here is the featureArr: ", featureArr, "length: ", featureArr.length)
    // Divide feature into groups of 200 so the url won't create an error

    let featuresObj = [];
    let featuresLength = featureArr.length,
                         chunk = 200,
                         subset;

    for (let i = 0; i < featuresLength; i += chunk) {
        subset = featureArr.slice(i, i + chunk);
        // output DIV with 12 items
        featuresObj.push(subset)
    }

    console.log("subset: ", subset)
    console.log("featuresObj: ", featuresObj)

    let data = [], targetId =[];
    let url = dataSource.url;
    const options = dataSource.options;
    const urlAddition = params.urlAddition;

    if (urlAddition) {
      url += encodeURIComponent(urlAddition);
      // url += encodeURIComponent(urlAddition.properties.street_address);
    }
    console.log('url', url);
    const successFn = options.success;

    let responseResult = [];


    for (let features of featuresObj) {
      // if the data is not dependent on other data

      console.log("features loop: ", features.join(","))

      let params = this.evaluateParams(features, dataSource);
      console.log("params: ", params)

      axios.get(url, { params }).then(response => {
        // call success fn
        let newData = response.data;

        if (successFn) {
          newData = successFn(newData);
          data = data.concat(newData)
        }

        let targetId;
        if (targetIdFn) {
          targetId = targetIdFn(feature);
        }

        // console.log('http-client.js is calling didFetchData')
        // this.dataManager.didFetchData(dataSourceKey, 'success', data, targetId, targetIdFn);
        responseResult = 'success'
        console.log("data: ", data)

      }, response => {
        // console.log('fetch json error', response);
        // this.dataManager.didFetchData(dataSourceKey, 'error');
        responseResult = 'error'
      })

    }

    // THIS LAST PART BELOW NEEDS TO WAIT FOR THE LOOP TO FINISH

    // console.log("responseResult: ", responseResult, data)

    // if(responseResult === 'success') {
    //   console.log("response was a SUCCESS, data: ", data)
    //   // this.dataManager.didFetchData(dataSourceKey, 'success', data, targetId, targetIdFn);
    // } else {
    //   console.log("response was an ERROR")
    //   // this.dataManager.didFetchData(dataSourceKey, 'error');
    // }

    // // console.log("Pushing is probably wrong, prob need to concat", data)




  }

  fetch(feature, dataSource, dataSourceKey, targetIdFn) {
    let params = this.evaluateParams(feature, dataSource);
    console.log('http-client fetch, feature:', feature, 'dataSource:', dataSource, 'dataSourceKey:', dataSourceKey, 'targetIdFn:', targetIdFn, 'params:', params);

    let featureArr = feature.split(',')
    console.log("Here is the featureArr: ", featureArr, "length: ", featureArr.length)


    if (featureArr.length < 210) {

      let url = dataSource.url;
      const options = dataSource.options;
      const urlAddition = params.urlAddition;
      if (urlAddition) {
        url += encodeURIComponent(urlAddition);
        // url += encodeURIComponent(urlAddition.properties.street_address);
      }
      console.log('url', url);
      // console.log('http-client fetch, feature:', feature, 'dataSource:', dataSource, 'dataSourceKey:', dataSourceKey, 'targetIdFn:', targetIdFn, 'params:', params);
      // console.log('http-client fetch, feature:', feature);
      const successFn = options.success;
      // console.log("feature length: ", feature)

      if (params.urlAddition) {
        delete params['urlAddition'];
      }

      // if the data is not dependent on other data
      axios.get(url, { params }).then(response => {
        // call success fn
        let data = response.data;

        if (successFn) {
          data = successFn(data);
        }

        // get target id, if there should be one
        let targetId;
        if (targetIdFn) {
          targetId = targetIdFn(feature);
          // console.log('in http-client, targetIdFn:', targetIdFn, 'feature:', feature, 'targetId:', targetId);
        }

        // console.log('http-client.js is calling didFetchData')
        console.log('in http-client, data:', data, 'targetId:', targetId);
        this.dataManager.didFetchData(dataSourceKey, 'success', data, targetId, targetIdFn);
      }, response => {
        // console.log('fetch json error', response);
        this.dataManager.didFetchData(dataSourceKey, 'error');
      });

    } else {

      console.log("The feature array is too long (current limit is 210)", this)
      this.fetchDataInSegments(feature, dataSource, dataSourceKey, targetIdFn, params)

    }


  }

  fetchMore(feature, dataSource, dataSourceKey, highestPageRetrieved) {
    let params = this.evaluateParams(feature, dataSource);
    params.page = highestPageRetrieved + 1;
    let url = dataSource.url;
    const options = dataSource.options;
    const urlAddition = params.urlAddition;
    if (urlAddition) {
      // url += encodeURIComponent(urlAddition.properties.street_address);
      url += encodeURIComponent(urlAddition);
    }
    const successFn = options.success;

    // if the data is not dependent on other data
    axios.get(url, { params }).then(response => {
      // call success fn
      let data = response.data;
      if (successFn) {
        data = successFn(data);
      }
      // console.log('data', data);
      this.dataManager.didFetchMoreData(dataSourceKey, 'success', data);
    }, response => {
      // console.log('fetch json error', response);
      this.dataManager.didFetchMoreData(dataSourceKey, 'error');
    });
  }

  fetchNearby(feature, dataSource, dataSourceKey, targetIdFn) {
    const params = this.evaluateParams(feature, dataSource);
    const url = dataSource.url;
    const options = dataSource.options;
    // const srid = options.srid || 4326;
    const table = options.table;
    // TODO generalize these options into something like a `sql` param that
    // returns a sql statement
    const dateMinNum = options.dateMinNum || null;
    const dateMinType = options.dateMinType || null;
    const dateField = options.dateField || null;
    const successFn = options.success;
    const distances = options.distances || 250;
    // console.log('fetchNearby distances:', distances);

    const distQuery = "ST_Distance(the_geom::geography, ST_SetSRID(ST_Point("
                    + feature.geometry.coordinates[0]
                    + "," + feature.geometry.coordinates[1]
                    + "),4326)::geography)";

    const latQuery = "ST_Y(the_geom)";
    const lngQuery = "ST_X(the_geom)";

    // let select = '*'
    // if (calculateDistance) {
    const select = "*, " + distQuery + 'as distance,' + latQuery + 'as lat, ' + lngQuery + 'as lng';
    // }

    params['q'] = "select" + select + " from " + table + " where " + distQuery + " < " + distances;

    if (dateMinNum) {
      params['q'] = params['q'] + " and " + dateField + " > '" + moment().subtract(dateMinNum, dateMinType).format('YYYY-MM-DD') + "'"
    }

    // if the data is not dependent on other data
    axios.get(url, { params }).then(response => {
      // call success fn
      let data = response.data.rows;
      // console.log('table and data', table, data);

      if (successFn) {
        data = successFn(data);
      }

      // get target id, if there should be one
      let targetId;
      if (targetIdFn) {
        targetId = targetIdFn(feature);
      }

      this.dataManager.didFetchData(dataSourceKey, 'success', data, targetId);
    }, response => {
      // console.log('fetch json error', response);
      this.dataManager.didFetchData(dataSourceKey, 'error');
    });
  }
}

export default HttpClient;
