import path = require('path');
import fs = require('fs');
import tl = require('vsts-task-lib/task');

var zipUtility = require('webdeployment-common/ziputility.js');
/**
 * Validates the input package and finds out input type
 * 
 * @param webDeployPkg Web Deploy Package input
 * 
 * @return true/false based on input package type.
 */
export function isInputPkgIsFolder(webDeployPkg: string) {
    if (!tl.exist(webDeployPkg)) {
        throw new Error(tl.loc('Invalidwebapppackageorfolderpathprovided', webDeployPkg));
    }

    return !fileExists(webDeployPkg);
}

/**
 * Checks whether the given path is file or not.
 * @param path input file path
 * 
 * @return true/false based on input is file or not.

 */
export function fileExists(path): boolean {
  try  {
    return tl.stats(path).isFile();
  }
  catch(error) {
    if(error.code == 'ENOENT') {
      return false;
    }
    tl.debug("Exception tl.stats (" + path + "): " + error);
    throw Error(error);
  }
}

/**
 * Validates whether input for path and returns right path.
 * 
 * @param path input
 * 
 * @returns null when input is empty, otherwise returns same path.
 */
export function copySetParamFileIfItExists(setParametersFile: string) : string {

    if(setParametersFile === null || (!tl.filePathSupplied('SetParametersFile')) || setParametersFile == tl.getVariable('System.DefaultWorkingDirectory')) {
        setParametersFile = null;
    }
    else if (!fileExists(setParametersFile)) {
        throw Error(tl.loc('SetParamFilenotfound0', setParametersFile));
    }
    else if(fileExists(setParametersFile)) {
        var tempSetParametersFile = path.join(tl.getVariable('System.DefaultWorkingDirectory'),"tempSetParameters.xml");
        tl.cp(setParametersFile, tempSetParametersFile);
        setParametersFile = tempSetParametersFile;
    }
    
    return setParametersFile;
}

/**
 * Checks if WebDeploy should be used to deploy webapp package or folder
 * 
 * @param useWebDeploy if user explicitly checked useWebDeploy
 */
export function canUseWebDeploy(useWebDeploy: boolean) {
    var win = tl.osType().match(/^Win/);
    return (useWebDeploy || win);
}


export function findfiles(filepath){

    tl.debug("Finding files matching input: " + filepath);

    var filesList : string [];
    if (filepath.indexOf('*') == -1 && filepath.indexOf('?') == -1) {

        // No pattern found, check literal path to a single file
        if(tl.exist(filepath)) {
            filesList = [filepath];
        }
        else {
            tl.debug('No matching files were found with search pattern: ' + filepath);
            return [];
        }
    } else {
        var firstWildcardIndex = function(str) {
            var idx = str.indexOf('*');

            var idxOfWildcard = str.indexOf('?');
            if (idxOfWildcard > -1) {
                return (idx > -1) ?
                    Math.min(idx, idxOfWildcard) : idxOfWildcard;
            }

            return idx;
        }

        // Find app files matching the specified pattern
        tl.debug('Matching glob pattern: ' + filepath);

        // First find the most complete path without any matching patterns
        var idx = firstWildcardIndex(filepath);
        tl.debug('Index of first wildcard: ' + idx);
        var slicedPath = filepath.slice(0, idx);
        var findPathRoot = path.dirname(slicedPath);
        if(slicedPath.endsWith("\\") || slicedPath.endsWith("/")){
            findPathRoot = slicedPath;
        }

        tl.debug('find root dir: ' + findPathRoot);

        // Now we get a list of all files under this root
        var allFiles = tl.find(findPathRoot);

        // Now matching the pattern against all files
        filesList = tl.match(allFiles, filepath, '', {matchBase: true});

        // Fail if no matching files were found
        if (!filesList || filesList.length == 0) {
            tl.debug('No matching files were found with search pattern: ' + filepath);
            return [];
        }
    }
    return filesList;
}

export function generateTemporaryFolderOrZipPath(folderPath: string, isFolder: boolean) {
    var randomString = Math.random().toString().split('.')[1];
    var tempPath = path.join(folderPath, 'temp_web_package_' + randomString +  (isFolder ? "" : ".zip"));
    if(tl.exist(tempPath)) {
        return generateTemporaryFolderOrZipPath(folderPath, isFolder);
    }
    return tempPath;
}

/**
 * Check whether the package contains parameter.xml file
 * @param   webAppPackage   web deploy package
 * @returns boolean
 */
export async function isMSDeployPackage(webAppPackage: string ) {
    var isParamFilePresent = false;
    var pacakgeComponent = await zipUtility.getArchivedEntries(webAppPackage);
    if (((pacakgeComponent["entries"].indexOf("parameters.xml") > -1) || (pacakgeComponent["entries"].indexOf("Parameters.xml") > -1)) && 
    ((pacakgeComponent["entries"].indexOf("systemInfo.xml") > -1) || (pacakgeComponent["entries"].indexOf("systeminfo.xml") > -1))) {
        isParamFilePresent = true;
    }
    tl.debug("Is the package an msdeploy package : " + isParamFilePresent);
    return isParamFilePresent;
}

export function copyDirectory(sourceDirectory: string, destDirectory: string) {
    if(!tl.exist(destDirectory)) {
        tl.mkdirP(destDirectory);
    }
    var listSrcDirectory = tl.find(sourceDirectory);
    for(var srcDirPath of listSrcDirectory) {
        var relativePath = srcDirPath.substring(sourceDirectory.length);
        var destinationPath = path.join(destDirectory, relativePath);
        if(tl.stats(srcDirPath).isDirectory()) {
            tl.mkdirP(destinationPath);
        }
        else {
            if(!tl.exist(path.dirname(destinationPath))) {
                tl.mkdirP(path.dirname(destinationPath));
            }
            tl.debug('copy file from: ' + srcDirPath + ' to: ' + destinationPath);
            tl.cp(srcDirPath, destinationPath, '-f', false);
        }
    }
}

export async function generateTemporaryFolderForDeployment(isFolderBasedDeployment: boolean, webDeployPkg: string) {
    var folderPath = generateTemporaryFolderOrZipPath(tl.getVariable('System.DefaultWorkingDirectory'), true);
        
    if(isFolderBasedDeployment) {
        tl.debug('Copying Web Packge: ' + webDeployPkg + ' to temporary location: ' + folderPath);
        copyDirectory(webDeployPkg, folderPath);
        tl.debug('Copied Web Package: ' + webDeployPkg + ' to temporary location: ' + folderPath + ' successfully.');
    }
    else {
        await zipUtility.unzip(webDeployPkg, folderPath);
    }
    return folderPath;
}

export async function archiveFolderForDeployment(isFolderBasedDeployment: boolean, folderPath: string) {
    var webDeployPkg;

    if(isFolderBasedDeployment) {
        webDeployPkg = folderPath;
    }
    else {
        var tempWebPackageZip = generateTemporaryFolderOrZipPath(tl.getVariable('System.DefaultWorkingDirectory'), false);
        webDeployPkg = await zipUtility.archiveFolder(folderPath, "", tempWebPackageZip);
        tl.rmRF(folderPath, true);
    }

    return {
        "webDeployPkg": webDeployPkg,
        "tempPackagePath": webDeployPkg
    };
}
